"use client";

// TripMapInner — the day/trip map (#30). Every entry that resolved to a place
// (lat/lon) becomes a numbered pin in chronological order, joined by a route
// line, coloured by category. Reads the same place_ids the rest of the planner
// uses. Loaded via dynamic({ ssr:false }) — react-leaflet is client-only.
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo, useEffect } from "react";
import { tripDays, entriesByDay } from "../lib/trip";
import { CAT_COLOR } from "./atoms";

function FitBounds({ points }) {
  const map = useMap();
  // In an effect, not the render body, so re-renders don't snap the view back
  // and StrictMode doesn't double-fire (#57). Keyed on the points' content.
  const key = JSON.stringify(points);
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function TripMapInner({ trip }) {
  // Placed entries in trip order (day, then within-day), numbered.
  const placed = useMemo(() => {
    const days = tripDays(trip);
    const byDay = entriesByDay(trip);
    const out = [];
    for (const d of days) for (const e of byDay[d.date] || []) {
      if (e.place && e.place.lat != null && e.place.lon != null) out.push(e);
    }
    return out;
  }, [trip]);

  const points = placed.map((e) => [e.place.lat, e.place.lon]);
  if (!points.length) {
    return <div className="tg-stub" style={{ padding: "2rem" }}>No placed entries yet — resolve places (the 🔍 picker, or Gather) to map them.</div>;
  }

  return (
    <>
      {/* Leaflet pins aren't exposed to screen readers — give an equivalent
          text list of the placed stops in trip order (#38). */}
      <ol className="sr-only" aria-label="Placed stops in order">
        {placed.map((e, i) => (
          <li key={e.id}>{i + 1}. {e.title}{e.day ? ` — ${e.day}` : ""}{e.place?.name ? ` — ${e.place.name}` : ""}</li>
        ))}
      </ol>
      <MapContainer center={points[0]} zoom={13} scrollWheelZoom aria-label="Map of placed trip stops" style={{ height: 540, width: "100%", borderRadius: 10 }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO' />
      <FitBounds points={points} />
      <Polyline positions={points} pathOptions={{ color: "#0d4c44", weight: 2, opacity: 0.4, dashArray: "4 6" }} />
      {placed.map((e, i) => (
        <CircleMarker key={e.id} center={[e.place.lat, e.place.lon]} radius={9}
          pathOptions={{ color: "#fff", weight: 2, fillColor: CAT_COLOR[e.category] || "#6b6358", fillOpacity: 1 }}>
          <Tooltip>{`${i + 1}. ${e.title}`}{e.day ? ` · ${e.day.slice(5)}` : ""}</Tooltip>
        </CircleMarker>
      ))}
      </MapContainer>
    </>
  );
}
