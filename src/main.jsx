import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Binoculars,
  Camera,
  ExternalLink,
  Images,
  Globe2,
  MapPin,
  Navigation,
  ScanEye,
  Search,
  Upload,
} from "lucide-react";
import "pannellum";
import "pannellum/build/pannellum.css";
import "./styles.css";

const API_BASE_URL = "http://127.0.0.1:5174";
const MAX_STITCH_PHOTOS = 28;

const PLACES = [
  {
    name: "Taj Mahal",
    city: "Agra, India",
    type: "Monument",
    lat: 27.1751,
    lng: 78.0421,
    note: "Best for testing tourist-place 360 navigation.",
  },
  {
    name: "India Gate",
    city: "New Delhi, India",
    type: "Landmark",
    lat: 28.6129,
    lng: 77.2295,
    note: "Open surroundings make Street View easier to inspect.",
  },
  {
    name: "Gateway of India",
    city: "Mumbai, India",
    type: "Waterfront",
    lat: 18.922,
    lng: 72.8347,
    note: "Good example of a public tourist spot with nearby map coverage.",
  },
  {
    name: "Hawa Mahal",
    city: "Jaipur, India",
    type: "Heritage",
    lat: 26.9239,
    lng: 75.8267,
    note: "Useful for checking dense urban landmark navigation.",
  },
  {
    name: "Charminar",
    city: "Hyderabad, India",
    type: "Heritage",
    lat: 17.3616,
    lng: 78.4747,
    note: "Street-level view depends on available Google coverage.",
  },
  {
    name: "Mysore Palace",
    city: "Mysuru, India",
    type: "Palace",
    lat: 12.3052,
    lng: 76.6552,
    note: "A strong test case for destination-first search.",
  },
  {
    name: "Eiffel Tower",
    city: "Paris, France",
    type: "Global",
    lat: 48.8584,
    lng: 2.2945,
    note: "International benchmark with rich Street View coverage.",
  },
  {
    name: "Colosseum",
    city: "Rome, Italy",
    type: "Global",
    lat: 41.8902,
    lng: 12.4922,
    note: "Good for testing old-city tourist navigation.",
  },
];

function mapsEmbed(place) {
  return `https://www.google.com/maps?q=${place.lat},${place.lng}&z=18&output=embed`;
}

function streetViewEmbed(place) {
  const label = encodeURIComponent(`${place.name}, ${place.city}`);
  return `https://maps.google.com/maps?q=${label}&layer=c&cbll=${place.lat},${place.lng}&cbp=11,0,0,0,0&output=svembed`;
}

function googleMapsUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}

function streetViewUrl(place) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${place.lat},${place.lng}&heading=0&pitch=0&fov=85`;
}

function RoomScanner({ onBack, onSavePanorama }) {
  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panoramaUrl, setPanoramaUrl] = useState("");
  const [stitchStatus, setStitchStatus] = useState("idle");
  const [stitchMessage, setStitchMessage] = useState("");
  const panoramaRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [photos]);

  useEffect(() => {
    if (!panoramaUrl || !panoramaRef.current) return undefined;

    if (viewerRef.current?.destroy) {
      viewerRef.current.destroy();
    }

    viewerRef.current = window.pannellum.viewer(panoramaRef.current, {
      type: "equirectangular",
      panorama: panoramaUrl,
      autoLoad: true,
      showControls: true,
      compass: false,
    });

    return () => {
      if (viewerRef.current?.destroy) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [panoramaUrl]);

  function addPhotos(fileList) {
    const nextPhotos = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
      }));

    setPhotos((current) => [...current, ...nextPhotos]);
    if (!photos.length && nextPhotos.length) setActiveIndex(0);
    setPanoramaUrl("");
    setStitchStatus("idle");
    setStitchMessage("");
  }

  async function generatePanorama() {
    if (photos.length < 4 || stitchStatus === "processing") return;

    setStitchStatus("processing");
    setStitchMessage(
      photos.length > MAX_STITCH_PHOTOS
        ? `Sending ${MAX_STITCH_PHOTOS} sampled photos to the local OpenCV stitcher...`
        : "Sending photos to local OpenCV stitcher..."
    );
    setPanoramaUrl("");

    const formData = new FormData();
    const photosForStitching = samplePhotos(photos, MAX_STITCH_PHOTOS);
    photosForStitching.forEach((photo) => {
      formData.append("photos", photo.file, photo.name);
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/stitch`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not create panorama.");
      }

      const newPanoUrl = `${API_BASE_URL}${result.panoramaUrl}?t=${Date.now()}`;
      setPanoramaUrl(newPanoUrl);
      setStitchStatus("done");
      setStitchMessage("Stitched panorama generated. Drag inside the viewer to look around.");
      if (onSavePanorama) {
        onSavePanorama(newPanoUrl);
      }
    } catch (error) {
      setStitchStatus("error");
      setStitchMessage(error.message);
    }
  }

  const activePhoto = photos[activeIndex];
  const totalSizeMb = photos.reduce((sum, photo) => sum + photo.size, 0) / 1024 / 1024;
  const coverageScore = Math.min(100, Math.round((photos.length / 30) * 100));
  const readiness =
    photos.length >= 24
      ? "Good photo count for a reconstruction attempt."
      : photos.length >= 12
        ? "Halfway there. Add more angles before expecting a clean result."
        : "Too few images for a true 360 room scan.";

  const canGenerate = photos.length >= 4;

  return (
    <main className="room-shell">
      <header className="room-header">
        <div>
          <p className="eyebrow">Room photo setup</p>
          <h2>Build a room 360 from your photos</h2>
          <span>
            Upload 20-30 overlapping room photos. This step prepares the image set and preview.
          </span>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back to places
        </button>
      </header>

      <section className="room-workspace">
        <label className="upload-zone">
          <Upload size={34} aria-hidden="true" />
          <strong>Upload room photos</strong>
          <span>Use many overlapping shots: left wall, right wall, ceiling, floor, corners, furniture.</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => addPhotos(event.target.files)}
          />
        </label>

        <div className="room-stats" aria-label="Room scan readiness">
          <div>
            <strong>{photos.length}</strong>
            <span>photos</span>
          </div>
          <div>
            <strong>{Math.round(totalSizeMb * 10) / 10} MB</strong>
            <span>loaded locally</span>
          </div>
          <div>
            <strong>{coverageScore}%</strong>
            <span>photo-count target</span>
          </div>
        </div>

        <div className="room-preview">
          {panoramaUrl ? (
            <div className="pano-viewer" ref={panoramaRef} />
          ) : stitchStatus === "processing" ? (
            <div className="empty-preview">
              <ScanEye size={46} aria-hidden="true" />
              <strong>Generating stitched panorama</strong>
              <span>This is running locally with OpenCV. Large image sets can take a while.</span>
            </div>
          ) : activePhoto ? (
            <img src={activePhoto.url} alt={activePhoto.name} />
          ) : (
            <div className="empty-preview">
              <Camera size={46} aria-hidden="true" />
              <strong>No room photos yet</strong>
              <span>Upload your image set to start reviewing the room coverage.</span>
            </div>
          )}
        </div>

        <aside className="scan-panel">
          <div>
            <h3>Scan result</h3>
            <p>
              {stitchMessage || readiness}
            </p>
          </div>

          <div className="progress-track" aria-label="Coverage progress">
            <span style={{ width: `${coverageScore}%` }} />
          </div>

          <div className="truth-box">
            <strong>Important truth</strong>
            <span>
              This now attempts real local panorama stitching. It can fail when photos are blurry,
              randomly ordered, captured from different positions, or missing strong overlap.
            </span>
          </div>

          <button
            className={`generate-button ${stitchStatus === "error" ? "error" : ""}`}
            disabled={!canGenerate || stitchStatus === "processing"}
            onClick={generatePanorama}
          >
            <ScanEye size={18} aria-hidden="true" />
            {stitchStatus === "processing" ? "Generating..." : "Generate Real 360"}
          </button>

          {!canGenerate && (
            <span className="button-note">Upload at least 4 overlapping photos to enable stitching.</span>
          )}

          <ol className="capture-list">
            <li>Stand near the center and rotate in small steps.</li>
            <li>Keep 30-50% overlap between nearby photos.</li>
            <li>Capture floor, ceiling, corners, furniture edges, and doorways.</li>
            <li>Avoid blurry photos and changing light between shots.</li>
          </ol>
        </aside>

        {photos.length > 0 && (
          <div className="thumb-strip" aria-label="Uploaded room photos">
            {photos.map((photo, index) => (
              <button
                className={index === activeIndex ? "active" : ""}
                key={photo.id}
                onClick={() => setActiveIndex(index)}
                title={photo.name}
              >
                <img src={photo.url} alt="" />
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function samplePhotos(items, limit) {
  if (items.length <= limit) return items;
  const lastIndex = items.length - 1;
  return Array.from({ length: limit }, (_item, index) => {
    return items[Math.round((index * lastIndex) / (limit - 1))];
  });
}

function ExploresView({ explores, onBack }) {
  const [activeUrl, setActiveUrl] = useState(explores[explores.length - 1] || "");
  const panoramaRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!activeUrl || !panoramaRef.current) return undefined;

    if (viewerRef.current?.destroy) {
      viewerRef.current.destroy();
    }

    viewerRef.current = window.pannellum.viewer(panoramaRef.current, {
      type: "equirectangular",
      panorama: activeUrl,
      autoLoad: true,
      showControls: true,
      compass: false,
    });

    return () => {
      if (viewerRef.current?.destroy) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, [activeUrl]);

  return (
    <main className="room-shell">
      <header className="room-header">
        <div>
          <p className="eyebrow">Your Explores</p>
          <h2>Generated 360 Panoramas</h2>
          <span>View your previously generated room scans.</span>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back to places
        </button>
      </header>

      <section className="room-workspace" style={{ display: 'block' }}>
        <div className="room-preview" style={{ marginBottom: '20px' }}>
          {activeUrl ? (
            <div className="pano-viewer" ref={panoramaRef} />
          ) : (
            <div className="empty-preview">
              <Globe2 size={46} aria-hidden="true" />
              <strong>No explores yet</strong>
              <span>Generate a panorama in Room Photos first.</span>
            </div>
          )}
        </div>

        {explores.length > 0 && (
          <div className="thumb-strip" aria-label="Generated panoramas">
            {explores.map((url, index) => (
              <button
                className={url === activeUrl ? "active" : ""}
                key={index}
                onClick={() => setActiveUrl(url)}
                title={`Panorama ${index + 1}`}
                style={{ width: 'auto', padding: '10px', minWidth: '100px' }}
              >
                Scan {index + 1}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(PLACES[0]);
  const [view, setView] = useState("street");
  const [mode, setMode] = useState("places");
  const [explores, setExplores] = useState([]);

  const filteredPlaces = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return PLACES;
    return PLACES.filter((place) =>
      `${place.name} ${place.city} ${place.type}`.toLowerCase().includes(text)
    );
  }, [query]);

  const activeSrc = view === "street" ? streetViewEmbed(selected) : mapsEmbed(selected);

  if (mode === "room") {
    return <RoomScanner onBack={() => setMode("places")} onSavePanorama={(url) => setExplores((prev) => [...prev, url])} />;
  }

  if (mode === "explores") {
    return <ExploresView explores={explores} onBack={() => setMode("places")} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Tourist places">
        <div className="brand-row">
          <div className="brand-mark">
            <Globe2 size={22} aria-hidden="true" />
          </div>
          <div>
            <h1>Tour 360</h1>
            <p>No API key. No paid calls.</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="room-button" style={{ flex: 1 }} onClick={() => setMode("room")}>
            <Images size={18} aria-hidden="true" />
            Room Photos
          </button>
          <button className="room-button" style={{ flex: 1 }} onClick={() => setMode("explores")}>
            <Globe2 size={18} aria-hidden="true" />
            Explores
          </button>
        </div>

        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places"
            aria-label="Search places"
          />
        </label>

        <div className="place-list">
          {filteredPlaces.map((place) => (
            <button
              className={`place-card ${place.name === selected.name ? "selected" : ""}`}
              key={place.name}
              onClick={() => {
                setSelected(place);
                setView("street");
              }}
            >
              <span className="place-card-top">
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.city}</small>
                </span>
                <MapPin size={18} aria-hidden="true" />
              </span>
              <span className="place-meta">{place.type}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="viewer-panel">
        <header className="viewer-header">
          <div>
            <p className="eyebrow">Selected destination</p>
            <h2>{selected.name}</h2>
            <span>{selected.city}</span>
          </div>
          <div className="view-toggle" aria-label="Viewer mode">
            <button
              className={view === "street" ? "active" : ""}
              onClick={() => setView("street")}
              aria-label="Show 360 view"
              title="360 view"
            >
              <ScanEye size={18} aria-hidden="true" />
              <span>360</span>
            </button>
            <button
              className={view === "map" ? "active" : ""}
              onClick={() => setView("map")}
              aria-label="Show map view"
              title="Map view"
            >
              <Navigation size={18} aria-hidden="true" />
              <span>Map</span>
            </button>
          </div>
        </header>

        <div className="map-frame">
          <iframe
            key={`${selected.name}-${view}`}
            title={`${selected.name} ${view === "street" ? "360 view" : "map"}`}
            src={activeSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>

        <footer className="action-bar">
          <div>
            <strong>{view === "street" ? "360 preview" : "Map preview"}</strong>
            <span>{selected.note}</span>
          </div>
          <div className="action-buttons">
            <a href={streetViewUrl(selected)} target="_blank" rel="noreferrer">
              <Binoculars size={17} aria-hidden="true" />
              Open 360
            </a>
            <a href={googleMapsUrl(selected)} target="_blank" rel="noreferrer">
              <ExternalLink size={17} aria-hidden="true" />
              Open Maps
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
