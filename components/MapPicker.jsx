"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default Leaflet marker icons don't resolve under bundlers; point them at the CDN.
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41],
});

function ClickToMove({ onMove }) {
  useMapEvents({ click(e) { onMove(e.latlng.lat, e.latlng.lng); } });
  return null;
}

/**
 * MapPicker — drag the marker (or click the map) to set the visit center,
 * then "Re-measure here" runs the measurement routine around the new point
 * via /api/measure and reports the fresh composite. The point you place is
 * "where you'd base a visit," not the admin centroid.
 */
export default function MapPicker({ cityId, name, lat, lon, accessToken, onMeasured }) {
  const start = (lat != null && lon != null) ? [lat, lon] : [39.5, -98.35];
  const [pos, setPos] = useState(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const move = (la, lo) => { setPos([la, lo]); setMsg(""); };

  async function remeasure(opts = {}) {
    setBusy(true); setMsg("Measuring around this point…");
    try {
      const body = opts.recenter ? { cityId, recenter: true } : { cityId, lat: pos[0], lon: pos[1] };
      const res = await fetch("/api/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Measure failed");
      if (data.center) setPos([data.center.lat, data.center.lon]);
      setMsg(`Done — composite ${data.measured ?? "?"} · café ${data.raw?.cafe_n ?? "?"} · water ${data.raw?.water_dist_m ?? "?"}m`);
      onMeasured?.(data);
    } catch (e) {
      setMsg(e.message || "Measure failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="map-picker">
      <div className="map-picker-canvas">
        <MapContainer center={start} zoom={15} style={{ height: "320px", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={pos}
            draggable
            icon={icon}
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); move(p.lat, p.lng); } }}
          />
          <ClickToMove onMove={move} />
        </MapContainer>
      </div>
      <div className="map-picker-bar">
        <span className="map-picker-coords">{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</span>
        <div className="map-picker-actions">
          <button type="button" className="ghost" disabled={busy} onClick={() => remeasure({ recenter: true })}>
            Auto-center on nightlife
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => remeasure()}>
            {busy ? "Measuring…" : "Re-measure here"}
          </button>
        </div>
      </div>
      {msg ? <p className="map-picker-msg">{msg}</p> : null}
    </div>
  );
}
