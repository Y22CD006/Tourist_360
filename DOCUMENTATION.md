# Tourist 360 & Room Scanner Documentation

Welcome to the documentation for the **Tourist 360** application. This document outlines how the application works, the technology stack utilized, the architecture, and details about the computer vision models and techniques running under the hood.

---

## 1. Project Overview

Tourist 360 is a web-based application designed to help users explore real-world tourist destinations and create their own 360-degree virtual rooms. 

It serves two primary functions:
1. **Places Explorer:** Browse a list of predefined famous landmarks and explore them via Google Maps and Google Street View.
2. **Room Scanner:** Upload overlapping photos of a physical room to generate a fully navigable 360-degree panoramic view, entirely processed and stitched locally on the backend.

---

## 2. Technology Stack

### Frontend
* **React:** The core UI framework used for building the component-based user interface.
* **Vite:** A fast build tool and development server that provides Hot Module Replacement (HMR).
* **Pannellum:** A lightweight, free, and open-source panorama viewer for the web. Built with HTML5, CSS3, JavaScript, and WebGL, it allows the native rendering of the generated equirectangular panoramas.
* **Lucide-React:** Used for clean, modern SVG icons throughout the user interface.
* **Vanilla CSS:** Custom CSS architecture without any heavy external frameworks (like Tailwind or Bootstrap) to maintain complete control over the design system.

### Backend
* **Node.js & Express:** The API server orchestrating uploads, routing, and serving static generated files.
* **Multer:** Middleware for handling `multipart/form-data`, primarily used for uploading multiple image files at once.
* **Python (child process):** Executed by the Node.js backend to perform the heavy lifting of image processing.

### Machine Learning / Computer Vision "Model"
* **OpenCV (`cv2`):** The premier open-source computer vision library. Specifically, the Python script heavily utilizes the `cv2.Stitcher` module to create panoramas.

---

## 3. How It Works (Architecture & Data Flow)

### 3.1. The Room Scanning Process
1. **Image Capture & Upload:** 
   The user takes 20-30 overlapping photos of a room and uploads them via the React frontend. The frontend performs local validation and previews.
2. **API Transmission:** 
   Once the user clicks "Generate", the images are sampled and sent to the backend endpoint (`/api/stitch`) via a `multipart/form-data` request.
3. **Backend Orchestration:** 
   The Express server saves these images into a unique temporary job folder using `multer` and then spawns a child process to run `stitch_panorama.py`.
4. **Python Computer Vision Pipeline:**
   * The script loads the images and scales them down (max width 1100px) to balance processing speed and memory constraints.
   * Images are passed to the OpenCV Stitcher pipeline, which attempts different modes (`SCANS` and `PANORAMA`).
   * Upon successful stitching, the resulting panorama is cropped to remove jagged black edges.
   * The output is written to disk as a high-quality JPEG.
5. **Frontend Rendering:** 
   The Node backend sends the URL of the newly created image back to the frontend. The `App` saves this into the **Explores** state, and `Pannellum` loads the image into an interactive, 360-degree WebGL viewer.

### 3.2. The Places Explorer
1. The frontend maintains a predefined list of tourist locations containing their GPS coordinates (latitude and longitude).
2. Selecting a place automatically dynamically constructs Google Maps and Google Street View embed URLs.
3. These URLs are passed to `iframe` elements, providing an instant rich-media exploration experience without requiring dedicated API keys.

---

## 4. The Model: OpenCV Stitcher

While not a Deep Learning or Generative AI model (like Midjourney or Stable Diffusion), the **OpenCV Stitching Pipeline** is a highly complex mathematical and algorithmic computer vision model.

### What it does:
The OpenCV Stitcher combines multiple overlapping images captured from the same camera viewpoint into a single, high-resolution continuous panorama.

### How it works under the hood:
1. **Feature Extraction:** It scans each uploaded image to identify distinct, invariant "features" (edges, corners, unique textures) using algorithms like ORB, SURF, or SIFT.
2. **Feature Matching:** It compares features across all images to find overlapping pairs and groups.
3. **Homography Estimation:** Using RANSAC (Random Sample Consensus), it calculates the mathematical transformation (camera translation, rotation, lens distortion) between the overlapping images.
4. **Warping & Bundle Adjustment:** It warps the images onto a common projection surface (equirectangular for 360 views) and globally optimizes the camera parameters to minimize misalignment.
5. **Seam Finding & Blending:** It calculates the optimal cutting paths (seams) where images overlap so that transitions are seamless, and finally applies Multi-Band Blending to smooth out lighting and exposure differences.

### Capabilities and Limitations:
* **High Accuracy:** Can produce pixel-perfect panoramas if images have good overlap (30-50%).
* **Lighting Normalization:** Automatically blends images that have slight exposure differences.
* **Limitation - Parallax Error:** It assumes a single viewpoint. If the user walks around the room while taking photos instead of pivoting from a single spot, the model will fail to estimate the homography properly.
* **Limitation - Featureless Walls:** If an image consists entirely of a blank white wall, the feature extractor will find nothing to match, causing the stitching process to fail.
