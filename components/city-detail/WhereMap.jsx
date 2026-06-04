"use client";

import { MapContainer, TileLayer, CircleMarker, Circle, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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
  if (polys.length) {
    const pts = polys.flat(2).filter((p) => Array.isArray(p));
    if (pts.length) {
      const lats = pts.map((p) => p[0]);
      const lons = pts.map((p) => p[1]);
      map.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], { padding: [40, 40] });
      return null;
    }
  }
  if (center) map.setView(center, 14.5);
  return null;
}

// The "Where you'd live" chapter map. Read-only: the real stay-zone boundary
// from cities.stay_zone_boundary, the saved visit pin, and the 700 m
// measurement field around it. Candidate-core selection (findVisitCenters) is
// server-side and not in the envelope yet — see features/magazine-detail.md.
export default function WhereMap({ lat, lon, boundary }) {
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
          <Circle center={center} radius={700} pathOptions={{ color: "#fbf6ea", weight: 8, opacity: 0.9, fill: false }} />
          <Circle center={center} radius={700} pathOptions={{ color: "#0d4c44", weight: 4, opacity: 1, fillColor: "#0d4c44", fillOpacity: 0.16 }} />
          <CircleMarker center={center} radius={18} pathOptions={{ color: "#0d4c44", weight: 1, opacity: 0.4, fillColor: "#fbf6ea", fillOpacity: 0.9 }} />
          <CircleMarker center={center} radius={10} pathOptions={{ color: "#fbf6ea", weight: 4, fillColor: "#0d4c44", fillOpacity: 1 }} />
        </>
      ) : null}
      <FitView polys={polys} center={hasPin ? center : null} />
    </MapContainer>
  );
}
