const cors = require("cors");
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { spawn } = require("child_process");
const { Pool } = require("pg");

const app = express();
const port = 5174;
const rootDir = path.resolve(__dirname);
const workDir = path.join(rootDir, "work");
const uploadDir = path.join(workDir, "uploads");
const outputDir = path.join(workDir, "outputs");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const pool = new Pool({
  connectionString: "postgresql://appdb1_wy2n_user:qYJrFnblnhmqakXoHEa3eW3N6RgWAsEI@dpg-d8tq3a67r5hc73akg230-a.singapore-postgres.render.com/appdb1_wy2n",
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS places (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      city VARCHAR(255) NOT NULL,
      type VARCHAR(255) NOT NULL,
      lat FLOAT NOT NULL,
      lng FLOAT NOT NULL,
      note TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS explores (
      id SERIAL PRIMARY KEY,
      url VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default places
  const { rowCount } = await pool.query('SELECT COUNT(*) FROM places');
  if (parseInt(rowCount, 10) === 0 || (await pool.query('SELECT * FROM places')).rows.length === 0) {
    const places = [
      { name: "Taj Mahal", city: "Agra, India", type: "Monument", lat: 27.1751, lng: 78.0421, note: "Best for testing tourist-place 360 navigation." },
      { name: "India Gate", city: "New Delhi, India", type: "Landmark", lat: 28.6129, lng: 77.2295, note: "Open surroundings make Street View easier to inspect." },
      { name: "Gateway of India", city: "Mumbai, India", type: "Waterfront", lat: 18.922, lng: 72.8347, note: "Good example of a public tourist spot with nearby map coverage." },
      { name: "Hawa Mahal", city: "Jaipur, India", type: "Heritage", lat: 26.9239, lng: 75.8267, note: "Useful for checking dense urban landmark navigation." },
      { name: "Charminar", city: "Hyderabad, India", type: "Heritage", lat: 17.3616, lng: 78.4747, note: "Street-level view depends on available Google coverage." },
      { name: "Mysore Palace", city: "Mysuru, India", type: "Palace", lat: 12.3052, lng: 76.6552, note: "A strong test case for destination-first search." },
      { name: "Eiffel Tower", city: "Paris, France", type: "Global", lat: 48.8584, lng: 2.2945, note: "International benchmark with rich Street View coverage." },
      { name: "Colosseum", city: "Rome, Italy", type: "Global", lat: 41.8902, lng: 12.4922, note: "Good for testing old-city tourist navigation." }
    ];

    for (const p of places) {
      await pool.query(
        'INSERT INTO places (name, city, type, lat, lng, note) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING',
        [p.name, p.city, p.type, p.lat, p.lng, p.note]
      );
    }
    console.log("Database seeded with default places.");
  }
}

initDB().catch(console.error);

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

app.get("/api/places", async (_request, response) => {
  try {
    const result = await pool.query('SELECT * FROM places ORDER BY id ASC');
    response.json(result.rows);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/explores", async (_request, response) => {
  try {
    const result = await pool.query('SELECT * FROM explores ORDER BY id ASC');
    const urls = result.rows.map(r => r.url);
    response.json(urls);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
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

  child.on("close", async (code) => {
    fs.rm(jobDir, { recursive: true, force: true }, () => {});

    if (code !== 0 || !fs.existsSync(resultPath)) {
      response.status(422).json({
        error: "OpenCV could not stitch these photos into a panorama. Retake from one center point with stronger overlap.",
        details: stderr || stdout,
      });
      return;
    }

    const panoramaUrl = `/outputs/${path.basename(resultPath)}`;
    
    try {
      await pool.query('INSERT INTO explores (url) VALUES ($1)', [`http://127.0.0.1:5174${panoramaUrl}`]);
    } catch (e) {
      console.error("Failed to insert explore into DB:", e);
    }

    response.json({
      ok: true,
      panoramaUrl: panoramaUrl,
      details: stdout,
    });
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Room stitch API running at http://127.0.0.1:${port}`);
});
