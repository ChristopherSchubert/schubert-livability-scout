"use client";

import { useEffect } from "react";
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
  // In an effect, not the render body — otherwise every PlannerProvider context
  // update re-snaps the map and loses the user's pan/zoom (#57).
  useEffect(() => {
    if (lat != null && lon != null) map.setView([lat, lon], 16);
  }, [lat, lon, map]);
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
  // The core circle/plateau sit at the adaptive MEASUREMENT center (#1), not the
  // saved pin — that's where the score was taken. When the center moved a
  // meaningful distance from the pin, we still mark the pin separately so the
  // map honestly shows "your pin is here; we measured the walkable core there."
  const wcc = cityItem.walkingCoreCenter;
  const hasCenter = wcc && Number.isFinite(wcc.lat) && Number.isFinite(wcc.lon);
  const center = hasCenter ? [wcc.lat, wcc.lon] : [lat, lon];
  const pinMoved = hasCenter && (wcc.moved || 0) >= 40;

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
        pathOptions={{ color: "#15512f", weight: 3, opacity: 0.9, fillColor: "#15512f", fillOpacity: 0.10 }}
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
        pathOptions={{ color: "#15512f", weight: 2, opacity: 0.75, fill: false, dashArray: "5 5" }}
      />

      {/* POI dots with weight-opacity. A null/NaN coordinate (partial cache
          write) would throw inside Leaflet and unmount the whole map — guard it. */}
      {positions
        .filter((p) => p.weight != null && p.weight > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lon))
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

      {/* Measurement center — black dot with paper halo, smaller than the chapter pin. */}
      <CircleMarker
        center={center}
        radius={7}
        pathOptions={{ color: "var(--bg)", weight: 2.5, fillColor: "#1b1814", fillOpacity: 1 }}
      />

      {/* The saved pin, shown separately only when the measurement center moved
          off it (so the relationship is legible, not silently relocated). */}
      {pinMoved ? (
        <CircleMarker
          center={[lat, lon]}
          radius={5}
          pathOptions={{ color: "#1b1814", weight: 2, fillColor: "var(--bg)", fillOpacity: 1, dashArray: "2 2" }}
        />
      ) : null}

      <ZoomToCore lat={center[0]} lon={center[1]} />
    </MapContainer>
  );
}
