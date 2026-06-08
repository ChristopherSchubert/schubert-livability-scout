"use client";

import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { PLATEAU, D_HALF, MAX_RADIUS } from "../../lib/measurers/walking-core.js";

// Leaflet canvas for the full-screen walking-core view. Same plateau + rings
// + POI dots as the chapter map (components/city-detail/WhereMap.jsx) — but
// full-bleed, with scroll-wheel zoom enabled and bottom-left scale + top-right
// zoom controls so the layout matches the standalone mockup. Tiles use the
// CARTO light_all basemap (paper-friendlier than raw OSM for this overlay
// language).

function ZoomToCore({ lat, lon }) {
  const map = useMap();
  if (lat != null && lon != null) {
    map.setView([lat, lon], 16);
  }
  return null;
}

export default function WalkingCoreMap({ cityItem }) {
  const lat = cityItem.lat;
  const lon = cityItem.lon;
  const positions = cityItem.poiPositions || [];
  if (lat == null || lon == null) {
    return (
      <div className="wc-map-empty" role="status">
        No coordinates set for {cityItem.name}.
      </div>
    );
  }
  const center = [lat, lon];

  return (
    <MapContainer
      center={center}
      zoom={16}
      zoomSnap={0.5}
      zoomDelta={0.5}
      zoomControl={false}
      scrollWheelZoom={true}
      className="wc-map"
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, © CARTO'
        maxZoom={19}
      />

      {/* Plateau — solid accent disk. */}
      <Circle
        center={center}
        radius={PLATEAU}
        pathOptions={{ color: "#0d4c44", weight: 3, opacity: 0.9, fillColor: "#0d4c44", fillOpacity: 0.10 }}
      />
      {/* 10-min reference ring. */}
      <Circle
        center={center}
        radius={800}
        pathOptions={{ color: "#b66f1a", weight: 2, opacity: 0.85, fill: false, dashArray: "5 5" }}
      />
      {/* Outer cutoff. */}
      <Circle
        center={center}
        radius={MAX_RADIUS}
        pathOptions={{ color: "#0d4c44", weight: 2, opacity: 0.75, fill: false, dashArray: "5 5" }}
      />

      {/* POI dots with weight-opacity. */}
      {positions
        .filter((p) => p.weight != null && p.weight > 0)
        .map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.lat, p.lon]}
            radius={5}
            pathOptions={{
              color: "#c25a1f",
              fillColor: "#c25a1f",
              weight: 1,
              fillOpacity: p.weight,
              opacity: Math.max(0.25, p.weight * 1.1),
            }}
          />
        ))}

      {/* Anchor — black dot with paper halo, smaller than the chapter pin. */}
      <CircleMarker
        center={center}
        radius={7}
        pathOptions={{ color: "#fbf6ea", weight: 2.5, fillColor: "#1b1814", fillOpacity: 1 }}
      />

      <ZoomToCore lat={lat} lon={lon} />
    </MapContainer>
  );
}
