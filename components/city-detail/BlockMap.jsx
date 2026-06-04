"use client";

// Tiny read-only Leaflet mini-map for one "Six blocks" card. Mirrors the
// recipe from public/city-detail-redesign.html (lines ~2208-2240 in the
// mockup script): no controls, no drag, no zoom, just OSM tiles + a dark
// double-ring marker centered on the block. The vintage-atlas tile filter
// is applied via .walk-leaflet .leaflet-tile-pane img in app/city-detail.css.
//
// Lives next to WhereMap.jsx (the big stay-zone map). Both are imported
// dynamically with ssr:false by MagazineDetail — Leaflet needs `window`.

import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function BlockMap({ lat, lon, zoom }) {
  if (lat == null || lon == null) return null;
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={zoom || 17}
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      keyboard={false}
      touchZoom={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <CircleMarker
        center={[lat, lon]}
        radius={9}
        pathOptions={{ color: "#fbf6ea", weight: 3, fillColor: "#0d4c44", fillOpacity: 1 }}
        interactive={false}
      />
    </MapContainer>
  );
}
