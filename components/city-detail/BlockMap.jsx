"use client";

// Tiny read-only Leaflet mini-map for one "Six blocks" card. No controls, no
// drag, no zoom — just OSM tiles + a marker centered on the block. The
// vintage-atlas tile filter is applied via .walk-leaflet .leaflet-tile-pane img
// in app/city-detail.css.
//
// The marker is a CSS divIcon (not a plain CircleMarker) so it can carry the
// app's editorial palette and depth: an accent-green dot in a paper ring, a
// soft drop shadow, and a faint accent halo so it reads clearly over the
// vintage tiles. Styles are inline here on purpose, to stay self-contained.
//
// Lives next to WhereMap.jsx (the big stay-zone map). Both are imported
// dynamically with ssr:false by MagazineDetail — Leaflet needs `window`.

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// App palette (city-detail.css): accent #15512f, paper #fbf6ea, ink #1b1814.
const blockPin = L.divIcon({
  className: "block-pin-icon",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html:
    '<span style="' +
    "display:block;box-sizing:border-box;width:20px;height:20px;border-radius:50%;" +
    "background:#15512f;border:3px solid #fbf6ea;" +
    "box-shadow:0 1px 5px rgba(27,24,20,.55), 0 0 0 6px rgba(13,76,68,.16);" +
    '"></span>',
});

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
      <Marker position={[lat, lon]} icon={blockPin} interactive={false} keyboard={false} />
    </MapContainer>
  );
}
