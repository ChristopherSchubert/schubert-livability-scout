"use client";

// TripWindow (issue #22) — the legs strip: each leg's city + date span across
// the trip window, with date adjust. The deck's full calendar-strip DRAG (soft
// edges sliding until a booking hardens them) is the noted enhancement; this
// ships the legs frame + editable dates (the data the strip manipulates).
import { tripDays } from "../../lib/trip";

export default function TripWindow({ trip, onUpdate }) {
  const legs = trip.legs || [];
  const days = tripDays(trip);

  function setLeg(i, patch) {
    onUpdate({ legs: legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  }

  return (
    <div className="trip-card" style={{ marginBottom: "1rem" }}>
      <div className="trip-ws-head">
        <h2>Window</h2>
        <span className="trip-ws-sub">
          {days.length} days · {legs.length} legs
        </span>
      </div>
      {legs.length === 0 ? (
        <p className="trip-ws-sub">No legs yet. Add a leg to anchor the window.</p>
      ) : (
        <div className="entry-list">
          {legs.map((l, i) => (
            <div
              key={i}
              className="entry-card"
              data-category="stay"
              style={{ "--spine": "var(--kind-stay)" }}
            >
              <div className="entry-card-title">{l.name || l.cityId || `Leg ${i + 1}`}</div>
              <div className="entry-row">
                <label className="entry-field">
                  <span>Arrive</span>
                  <input
                    type="date"
                    value={l.arrive || ""}
                    onChange={(e) => setLeg(i, { arrive: e.target.value })}
                  />
                </label>
                <label className="entry-field">
                  <span>Depart</span>
                  <input
                    type="date"
                    value={l.depart || ""}
                    onChange={(e) => setLeg(i, { depart: e.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
