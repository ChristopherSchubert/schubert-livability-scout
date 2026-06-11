"use client";

// GridView (issue #29) — the generated grid: a time-gutter × day-columns view of
// the Solve output. A view-swap over the same data as AgendaView (#28), not a
// second model. Reuses the EntryCard atom in compact density. Collapses to the
// agenda on phones (#35) via CSS; here it renders the desk instrument.
import { entriesByDay, tripDays, entryStartMinutes } from "../../lib/trip";
import { EntryCard } from "./atoms";

const START_H = 6;
const END_H = 23;
const PX_PER_MIN = 0.9;

export default function GridView({ trip, onEditEntry }) {
  const days = tripDays(trip);
  const byDay = entriesByDay(trip);
  if (!days.length) return <p className="trip-ws-sub">Set trip dates to generate the grid.</p>;

  const height = (END_H - START_H) * 60 * PX_PER_MIN;

  return (
    <div className="grid-scroll" style={{ overflowX: "auto" }}>
      <div
        className="grid-wrap"
        style={{
          display: "grid",
          gridTemplateColumns: `48px repeat(${days.length}, minmax(160px, 1fr))`,
          gap: 0,
        }}
      >
        {/* time gutter */}
        <div className="grid-gutter" style={{ position: "relative", height }}>
          {Array.from({ length: END_H - START_H + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: i * 60 * PX_PER_MIN,
                fontSize: "0.65rem",
                color: "var(--muted)",
              }}
            >
              {String(START_H + i).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.date}
            style={{ position: "relative", height, borderLeft: "1px solid var(--border)" }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                fontSize: "0.7rem",
                padding: "0 0.25rem",
                background: "var(--bg)",
              }}
            >
              {d.date.slice(5)}
            </div>
            {(byDay[d.date] || [])
              .filter((e) => entryStartMinutes(e) != null)
              .map((e) => {
                const start = entryStartMinutes(e);
                const top = (start - START_H * 60) * PX_PER_MIN;
                return (
                  <div key={e.id} style={{ position: "absolute", top, left: 2, right: 2 }}>
                    <EntryCard entry={e} density="compact" onClick={() => onEditEntry(e)} />
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
