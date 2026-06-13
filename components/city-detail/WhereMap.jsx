"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { PLATEAU, D_HALF, MAX_RADIUS } from "../../lib/measurers/walking-core.js";

// GeoJSON Polygon/MultiPolygon → Leaflet [lat,lon] ring arrays. GeoJSON is
// [lon,lat]; Leaflet wants [lat,lon].
function geojsonToLeafletPolys(geojson) {
  if (!geojson) return [];
  const polys = geojson.type === "MultiPolygon" ? geojson.coordinates : [geojson.coordinates];
  return polys.map((rings) => rings.map((ring) => ring.map(([lon, lat]) => [lat, lon])));
}

// Fit the view to the stay-zone polygon when present, else to the pin.
function FitView({ polys, center }) {
  const map = useMap();
  // In an effect, not the render body, so an unrelated re-render doesn't reset
  // the user's pan/zoom and StrictMode doesn't double-fire (#57). Keyed on the
  // geometry's content so it re-fits only when the polygon/pin actually changes.
  const polyKey = JSON.stringify(polys);
  const centerKey = center ? center.join(",") : "";
  useEffect(() => {
    const pts = (polys || []).flat(2).filter((p) => Array.isArray(p));
    if (pts.length) {
      const lats = pts.map((p) => p[0]);
      const lons = pts.map((p) => p[1]);
      map.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], { padding: [40, 40] });
    } else if (center) {
      map.setView(center, 14.5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyKey, centerKey, map]);
  return null;
}

// The "Where you'd live" chapter map.
//
// Three layers, anchored at the saved visit pin:
//   1. Stay-zone polygon (cities.stay_zone_boundary), dashed warn-red — the
//      broader walkable area you'd consider staying in.
//   2. Measurement field — the plateau-decay walking core. A solid green
//      disk at PLATEAU (everything inside counts equally), a dashed ochre
//      ring at 800 m (10-min reference shed), and a dashed green ring at
//      MAX_RADIUS (outer cutoff). Replaces the old 700 m hard disk.
//   3. POI dots from cities.poi_positions (Google Places via the local
//      cache) with opacity = the precomputed plateau-decay weight, so the
//      reader can see which spots are contributing how much.
//
// Plateau / d_half / max_radius come from lib/measurers/walking-core.js — one
// source of truth shared by the measurer and the renderer.
export default function WhereMap({ lat, lon, boundary, poiPositions = [] }) {
  const hasPin = lat != null && lon != null;
  const center = hasPin ? [lat, lon] : [39.5, -98.35]; // US centroid fallback
  const polys = geojsonToLeafletPolys(boundary);

  return (
    <MapContainer
      center={center}
      zoom={14}
      zoomSnap={0.5}
      zoomDelta={0.5}
      scrollWheelZoom={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {polys.map((positions, i) => (
        <Polygon
          key={i}
          positions={positions}
          pathOptions={{ color: "#a23a30", weight: 2, opacity: 0.85, fillColor: "#a23a30", fillOpacity: 0.06, dashArray: "4 5" }}
        />
      ))}
      {hasPin ? (
        <>
          {/* Plateau — solid accent disk. Everything in here counts equally. */}
          <Circle
            center={center}
            radius={PLATEAU}
            pathOptions={{ color: "#0d4c44", weight: 3, opacity: 0.9, fillColor: "#0d4c44", fillOpacity: 0.10 }}
          />
          {/* 10-min reference shed at 800 m — dashed ochre. */}
          <Circle
            center={center}
            radius={800}
            pathOptions={{ color: "#b66f1a", weight: 2, opacity: 0.85, fill: false, dashArray: "5 5" }}
          />
          {/* Outer cutoff at MAX_RADIUS — dashed accent green. */}
          <Circle
            center={center}
            radius={MAX_RADIUS}
            pathOptions={{ color: "#0d4c44", weight: 2, opacity: 0.75, fill: false, dashArray: "5 5" }}
          />

          {/* POI dots, opacity = w(d). Skips anything past the cutoff (already
              filtered by the measurer; the .filter here is belt-and-suspenders). */}
          {poiPositions
            .filter((p) => p.weight != null && p.weight > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lon))
            .map((p, i) => (
              <CircleMarker
                key={i}
                center={[p.lat, p.lon]}
                radius={4.5}
                pathOptions={{
                  color: "#c25a1f",
                  fillColor: "#c25a1f",
                  weight: 1,
                  fillOpacity: p.weight,
                  opacity: Math.max(0.25, p.weight * 1.1),
                }}
              />
            ))}

          {/* Visit-center pin — double ring so it reads at every zoom. */}
          <CircleMarker center={center} radius={18} pathOptions={{ color: "#0d4c44", weight: 1, opacity: 0.4, fillColor: "#fbf6ea", fillOpacity: 0.9 }} />
          <CircleMarker center={center} radius={10} pathOptions={{ color: "#fbf6ea", weight: 4, fillColor: "#0d4c44", fillOpacity: 1 }} />
        </>
      ) : null}
      <FitView polys={polys} center={hasPin ? center : null} />
    </MapContainer>
  );
}
