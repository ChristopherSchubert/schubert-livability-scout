"use client";

// DayMap (issue #30) — the day's placed entries as pins in TIME ORDER, plus a
// one-tap route link (Google Maps directions with the ordered waypoints). Reads
// each entry's resolved place.{lat,lon} (the place-resolution keystone #13) and
// the same coordinates Solve's travel math uses. Full Leaflet/OSM tiles are the
// enhancement; this ships the honest, build-safe core (no SSR/tile dependency).
import { entriesByDay, tripDays } from "../../lib/trip";
import { PlaceRef } from "./atoms";

export default function DayMap({ trip, date }) {
  const days = tripDays(trip);
  const day = date || days[0]?.date;
  const placed = (entriesByDay(trip)[day] || []).filter((e) => e.place?.lat != null);

  if (!placed.length)
    return (
      <p className="trip-ws-sub">No placed entries on {day} yet — resolve places to map the day.</p>
    );

  const route = `https://www.google.com/maps/dir/${placed.map((e) => `${e.place.lat},${e.place.lon}`).join("/")}`;

  return (
    <div className="trip-card" style={{ marginTop: "1rem" }}>
      <div className="trip-ws-head">
        <h2>Day map · {day}</h2>
        <a className="auth-ghost" href={route} target="_blank" rel="noreferrer">
          Open route ↗
        </a>
      </div>
      <ol className="entry-list">
        {placed.map((e, i) => (
          <li
            key={e.id}
            className="entry-card"
            data-category={e.category || "activity"}
            style={{ "--spine": `var(--kind-${e.category || "activity"})` }}
          >
            <div className="entry-card-title">
              <span className="map-pin-num">{i + 1}</span> {e.title}
            </div>
            <PlaceRef place={e.place} />
          </li>
        ))}
      </ol>
    </div>
  );
}
