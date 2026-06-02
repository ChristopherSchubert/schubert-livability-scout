"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
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

// Point `dM` metres from (lat,lon) along compass azimuth `az` (degrees).
function offsetPoint(lat, lon, az, dM) {
  const R = 6371000, ad = dM / R, a = az * Math.PI / 180, la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(ad) + Math.cos(la) * Math.sin(ad) * Math.cos(a));
  const lo2 = lo + Math.atan2(Math.sin(a) * Math.sin(ad) * Math.cos(la), Math.cos(ad) - Math.sin(la) * Math.sin(la2));
  return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
}
function peakIcon(p) {
  const km = p.dist_m >= 1000 ? `${(p.dist_m / 1000).toFixed(0)} km` : `${p.dist_m} m`;
  return L.divIcon({
    className: "peak-div",
    html: `<div class="peak-pin"><span class="peak-tri">▲</span><span class="peak-lbl">${p.name}<br><b>${p.angle}°</b> · ${km} ${p.dir}</span></div>`,
    iconSize: [0, 0], iconAnchor: [0, 0],
  });
}

// Fit the map to show the center plus the water target / candidate bodies, so
// the whole "distance to water" line is visible. Re-fits only when the water
// data changes (not on pan), and never while editing the center.
function FitWater({ center, waterPoint, cands, editing }) {
  const map = useMap();
  const key = JSON.stringify([waterPoint || null, (cands || []).map((b) => b.point), editing]);
  useEffect(() => {
    if (editing) return;
    const pts = [center];
    if (waterPoint) pts.push([waterPoint.lat, waterPoint.lon]);
    if (cands) for (const b of cands) pts.push([b.point.lat, b.point.lon]);
    if (pts.length < 2) return;
    map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/**
 * MapPicker — view the visit center on a pannable map. The pin is locked by
 * default so you can freely pan/zoom; hit "Edit center" to make it draggable
 * (or click-to-place), then "Save new center" runs the measurement routine
 * around the new point via /api/measure and reports the fresh composite. The
 * point you place is "where you'd base a visit," not the admin centroid.
 */
export default function MapPicker({ cityId, name, lat, lon, accessToken, onMeasured, waterPoint, waterName, waterCands, horizon }) {
  const start = (lat != null && lon != null) ? [lat, lon] : [39.5, -98.35];
  const [committed, setCommitted] = useState(start); // last saved center
  const [pos, setPos] = useState(start);             // current (maybe-unsaved) pin
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [candidates, setCandidates] = useState(null); // suggested cores
  const [selIdx, setSelIdx] = useState(null);

  // Re-sync if the city (or its saved center) changes underneath us.
  useEffect(() => {
    setCommitted(start); setPos(start); setEditing(false); setMsg("");
    setCandidates(null); setSelIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, lat, lon]);

  const move = (la, lo) => { if (editing) { setPos([la, lo]); setSelIdx(null); setMsg(""); } };
  const moved = pos[0] !== committed[0] || pos[1] !== committed[1];

  function cancel() { setPos(committed); setEditing(false); setMsg(""); setCandidates(null); setSelIdx(null); }

  function pickCandidate(c, i) { setPos([c.lat, c.lon]); setSelIdx(i); setMsg(""); }

  async function scout() {
    setBusy(true); setMsg("Scanning a 5 km net for candidate cores…");
    try {
      const res = await fetch("/api/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ cityId, scout: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scout failed");
      setCandidates(data.candidates || []);
      setMsg(`${(data.candidates || []).length} candidate cores — pick one (or drag your own), then save.`);
    } catch (e) {
      setMsg(e.message || "Scout failed");
    } finally {
      setBusy(false);
    }
  }

  const fmtM = (m) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

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
      const next = data.center ? [data.center.lat, data.center.lon] : pos;
      setPos(next); setCommitted(next); setEditing(false); setCandidates(null); setSelIdx(null);
      const r = data.raw || {};
      setMsg(`Saved & re-measured — composite ${data.measured ?? "?"} · Walk Score ${r.walk_score ?? "?"} · café ${r.cafe_n ?? "?"} · water ${r.water_dist_m ?? "?"}m · median ${r.median_price_usd ? "$" + r.median_price_usd.toLocaleString() : "?"}`);
      onMeasured?.(data);
    } catch (e) {
      setMsg(e.message || "Measure failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`map-picker${editing ? " editing" : ""}`}>
      <div className="map-picker-canvas">
        <MapContainer center={start} zoom={15} style={{ height: "340px", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {editing && candidates ? candidates.map((c, i) => (
            <CircleMarker
              key={i}
              center={[c.lat, c.lon]}
              radius={selIdx === i ? 13 : 10}
              pathOptions={{ color: "#fffdf8", weight: 2, fillColor: selIdx === i ? "#3c7d57" : "#c08457", fillOpacity: 0.92 }}
              eventHandlers={{ click: () => pickCandidate(c, i) }}
            >
              <Tooltip permanent direction="center" className="center-rank">{i + 1}</Tooltip>
            </CircleMarker>
          )) : null}
          {/* Water target: dashed line from the center to the body we measure to. */}
          {waterPoint ? (
            <>
              <Polyline positions={[committed, [waterPoint.lat, waterPoint.lon]]} pathOptions={{ color: "#3a78c2", weight: 2.5, dashArray: "6 5" }} />
              <CircleMarker center={[waterPoint.lat, waterPoint.lon]} radius={6} pathOptions={{ color: "#fffdf8", weight: 2, fillColor: "#3a78c2", fillOpacity: 0.95 }}>
                <Tooltip direction="top">{waterName || "Nearest water"}</Tooltip>
              </CircleMarker>
            </>
          ) : null}
          {/* Candidate water bodies shown while choosing a target. */}
          {waterCands ? waterCands.map((b, i) => (
            <CircleMarker key={`w${i}`} center={[b.point.lat, b.point.lon]} radius={5} pathOptions={{ color: "#fffdf8", weight: 1.5, fillColor: "#7aa7d8", fillOpacity: 0.9 }}>
              <Tooltip direction="top">{b.name} · {b.dist >= 1000 ? `${(b.dist / 1000).toFixed(1)} km` : `${b.dist} m`}</Tooltip>
            </CircleMarker>
          )) : null}
          {/* Horizon compass: visible named peaks ringed around the center by
              direction (clamped to a readable radius; true distance in label). */}
          {!editing && horizon?.peaks?.length ? horizon.peaks.map((p, i) => (
            <Marker key={`pk${i}`} position={offsetPoint(committed[0], committed[1], p.az, 1200)} icon={peakIcon(p)} interactive={false} />
          )) : null}
          <Marker
            position={pos}
            draggable={editing}
            icon={icon}
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); move(p.lat, p.lng); } }}
          />
          {editing ? <ClickToMove onMove={move} /> : null}
          <FitWater center={committed} waterPoint={waterPoint} cands={waterCands} editing={editing} />
        </MapContainer>
        {editing ? <span className="map-picker-editing-tag">Editing — pick a numbered core, drag the pin, or click the map</span> : null}
      </div>

      {editing && candidates?.length ? (
        <ul className="center-options">
          {candidates.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                className={`center-option${selIdx === i ? " selected" : ""}`}
                onClick={() => pickCandidate(c, i)}
              >
                <span className="center-option-rank">{i + 1}</span>
                <span className="center-option-main">
                  <strong>{c.n} social spots</strong> within 500 m
                  <span className="center-option-sub">{fmtM(c.water_dist_m)} to water · {fmtM(c.moved)} from current center</span>
                </span>
                {selIdx === i ? <span className="center-option-check">✓ selected</span> : <span className="center-option-pick">Use this</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="map-picker-bar">
        <span className="map-picker-coords">
          {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
          {editing && moved ? <em className="map-picker-unsaved"> · unsaved</em> : null}
        </span>
        <div className="map-picker-actions">
          {!editing ? (
            <button type="button" className="primary" onClick={() => { setMsg(""); setEditing(true); }}>
              Edit center
            </button>
          ) : (
            <>
              <button type="button" className="ghost" disabled={busy} onClick={cancel}>Cancel</button>
              <button type="button" className="ghost" disabled={busy} onClick={scout}>
                Suggest cores
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => remeasure()}>
                {busy ? "Saving…" : "Save new center"}
              </button>
            </>
          )}
        </div>
      </div>
      {msg ? <p className="map-picker-msg">{msg}</p> : null}
    </div>
  );
}
