import json
import sys
from pathlib import Path

import cv2

MAX_WORKING_WIDTH = 1100
MAX_INPUT_IMAGES = 28
JPEG_QUALITY = 88


STATUS_MESSAGES = {
    cv2.Stitcher_OK: "OK",
    cv2.Stitcher_ERR_NEED_MORE_IMGS: "Need more matching image overlap.",
    cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "Could not estimate camera movement between photos.",
    cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "Could not adjust camera parameters.",
}


def load_image(path: Path, max_width: int = MAX_WORKING_WIDTH):
    image = cv2.imread(str(path))
    if image is None:
        return None

    height, width = image.shape[:2]
    if width > max_width:
        scale = max_width / width
        image = cv2.resize(image, (max_width, int(height * scale)), interpolation=cv2.INTER_AREA)
    return image


def crop_black_edges(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, threshold = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image
    contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(contour)
    if w < 20 or h < 20:
        return image
    return image[y : y + h, x : x + w]


def stitch(images, mode):
    stitcher = cv2.Stitcher_create(mode)
    stitcher.setPanoConfidenceThresh(0.35)
    stitcher.setRegistrationResol(0.6)
    stitcher.setSeamEstimationResol(0.15)
    stitcher.setCompositingResol(0.8)
    stitcher.setWaveCorrection(False)
    return stitcher.stitch(images)


def evenly_sample(items, limit):
    if len(items) <= limit:
        return items
    if limit < 2:
        return items[:limit]
    last = len(items) - 1
    return [items[round(index * last / (limit - 1))] for index in range(limit)]


def main():
    if len(sys.argv) != 3:
        print("Usage: stitch_panorama.py <input_dir> <output_path>", file=sys.stderr)
        sys.exit(2)

    input_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    image_paths = sorted(
        [
            path
            for path in input_dir.iterdir()
            if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        ]
    )
    image_paths = evenly_sample(image_paths, MAX_INPUT_IMAGES)
    images = [load_image(path) for path in image_paths]
    images = [image for image in images if image is not None]

    if len(images) < 4:
        print("Need at least 4 readable images.", file=sys.stderr)
        sys.exit(1)

    attempts = []
    for mode_name, mode in [("SCANS", cv2.Stitcher_SCANS), ("PANORAMA", cv2.Stitcher_PANORAMA)]:
        status, panorama = stitch(images, mode)
        attempts.append(
            {
                "mode": mode_name,
                "status": int(status),
                "message": STATUS_MESSAGES.get(status, "Unknown"),
            }
        )
        if status == cv2.Stitcher_OK:
            panorama = crop_black_edges(panorama)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(output_path), panorama, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            print(
                json.dumps(
                    {
                        "ok": True,
                        "mode": mode_name,
                        "inputImages": len(images),
                        "workingWidth": MAX_WORKING_WIDTH,
                        "attempts": attempts,
                    }
                )
            )
            return

    print(json.dumps({"ok": False, "attempts": attempts}), file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
