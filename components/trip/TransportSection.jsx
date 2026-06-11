"use client";

// TransportSection (issue #23) — flights/trains/ferries with each-end-local
// times + zero-API live-status deep links (transportDeepLinks, #10). Edge-
// locking: a departure is a hard fixed-time that Solve flows the leave-for-
// airport connective around (the adapter treats point times as hard, #27).
import { transportDeepLinks } from "../../lib/trip";

export default function TransportSection({ trip, onEditEntry }) {
  const legs = (trip.entries || []).filter((e) => e.category === "travel" && e.transport);
  if (!legs.length) return null;

  return (
    <div className="trip-card" style={{ marginTop: "1rem" }}>
      <h2>Transport</h2>
      <div className="entry-list">
        {legs.map((e) => {
          const t = e.transport;
          const links = transportDeepLinks(t);
          return (
            <div
              key={e.id}
              className="entry-card"
              data-category="travel"
              style={{ "--spine": "var(--kind-travel)" }}
            >
              <div className="entry-card-title">
                {t.carrier} {t.number} · {t.from} → {t.to}
              </div>
              <div className="entry-card-meta">
                {t.departLocal ? <span className="time-chip">🛫 {t.departLocal}</span> : null}
                {t.arriveLocal ? <span className="time-chip">🛬 {t.arriveLocal}</span> : null}
                {e.arriveBy ? (
                  <span className="booking-badge" data-status="toBook">
                    be there by {e.arriveBy}
                  </span>
                ) : null}
                {t.pnr ? <code>{t.pnr}</code> : null}
              </div>
              <div className="entry-card-meta">
                {links.flightAware ? (
                  <a href={links.flightAware} target="_blank" rel="noreferrer">
                    FlightAware ↗
                  </a>
                ) : null}
                {links.googleStatus ? (
                  <a href={links.googleStatus} target="_blank" rel="noreferrer">
                    Status ↗
                  </a>
                ) : null}
                <button type="button" className="auth-ghost" onClick={() => onEditEntry(e)}>
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
