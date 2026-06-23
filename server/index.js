const cors = require("cors");
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const port = 5174;
const rootDir = path.resolve(__dirname, "..");
const workDir = path.join(rootDir, "work");
const uploadDir = path.join(workDir, "uploads");
const outputDir = path.join(workDir, "outputs");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDir),
  filename: (_request, file, callback) => {
    const safeName = file.originalname.replace(/[^a-z0-9._-]/gi, "_");
    callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 80,
    fileSize: 20 * 1024 * 1024,
  },
});

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use("/outputs", express.static(outputDir));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/stitch", upload.array("photos", 80), (request, response) => {
  const files = request.files || [];
  if (files.length < 4) {
    response.status(400).json({ error: "Upload at least 4 overlapping images." });
    return;
  }

  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const jobDir = path.join(uploadDir, jobId);
  const resultPath = path.join(outputDir, `${jobId}.jpg`);
  fs.mkdirSync(jobDir, { recursive: true });

  for (const file of files) {
    fs.renameSync(file.path, path.join(jobDir, file.filename));
  }

  const scriptPath = path.join(rootDir, "scripts", "stitch_panorama.py");
  const child = spawn("python", [scriptPath, jobDir, resultPath], {
    cwd: rootDir,
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    fs.rm(jobDir, { recursive: true, force: true }, () => {});

    if (code !== 0 || !fs.existsSync(resultPath)) {
      response.status(422).json({
        error:
          "OpenCV could not stitch these photos into a panorama. Retake from one center point with stronger overlap.",
        details: stderr || stdout,
      });
      return;
    }

    response.json({
      ok: true,
      panoramaUrl: `/outputs/${path.basename(resultPath)}`,
      details: stdout,
    });
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Room stitch API running at http://127.0.0.1:${port}`);
});
