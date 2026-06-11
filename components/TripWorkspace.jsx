"use client";

// The trip page (/trips/[id]) — the first surface that renders a real v2 trip
// from trip_entries via TripProvider. A day-by-day agenda (the "Days" baseline;
// the solved hour-grid is Phase 2) plus the derived frame: travelers, passes,
// cash-needed, and the bookings ledger — all computed live by lib/trip.js, not
// stored. Click an entry to edit it in the EntryEditor.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTrips } from "./TripProvider";
import { tripDays, entriesByDay, cashNeeded, bookingsLedger, MARKER_TYPES } from "../lib/trip";
import EntryEditor from "./EntryEditor";

const CAT_ICON = { travel: "🚆", meal: "🍴", activity: "🥾", stay: "🛏", errand: "🧾" };
const STATUS_LABEL = { booked: "booked", reserved: "held", toBook: "to book", none: "" };

function fmtMoney(map) {
  const parts = Object.entries(map || {}).map(([cur, n]) => `${cur === "EUR" ? "€" : cur + " "}${n}`);
  return parts.join(" · ") || "—";
}
function entryTime(e) {
  const t = e.time || {};
  if (t.mode === "range" && t.start) return t.end ? `${t.start}–${t.end}` : t.start;
  if (t.mode === "point" && t.at) return t.at;
  return "";
}

export default function TripWorkspace({ tripId }) {
  const { active, hydrated, enterTrip } = useTrips();
  const [editing, setEditing] = useState(null); // the entry being edited, or null

  useEffect(() => { if (tripId) enterTrip(tripId); }, [tripId]); // eslint-disable-line

  const trip = active && active.id === tripId ? active : null;
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const byDay = useMemo(() => (trip ? entriesByDay(trip) : {}), [trip]);
  const cash = useMemo(() => (trip ? cashNeeded(trip) : {}), [trip]);
  const bookings = useMemo(() => (trip ? bookingsLedger(trip) : []), [trip]);

  if (!hydrated || !trip) {
    return <main className="tw-wrap"><p className="tw-loading">{hydrated ? "Trip not found." : "Loading trip…"}</p></main>;
  }

  return (
    <main className="tw-wrap">
      <header className="tw-head">
        <p className="tw-crumb"><Link href="/trips">Trips</Link> ›</p>
        <h1>{trip.name}</h1>
        <p className="tw-meta">
          {trip.startDate} – {trip.endDate} · {trip.legs?.length || 0} legs · {trip.entries.length} entries
        </p>
        <div className="tw-frame">
          {(trip.travelers || []).map((t) => (
            <span key={t.name} className="tw-trav">{t.kind === "pet" ? "🐾" : "🧑"} {t.name}
              {t.chips?.length ? <em> · {t.chips.join(", ")}</em> : null}</span>
          ))}
          {(trip.passes || []).map((p) => <span key={p.id} className="tw-pass">🎟 {p.name}</span>)}
        </div>
        <div className="tw-rollups">
          <span className="tw-cash">💶 cash needed: <b>{fmtMoney(cash)}</b></span>
          <span className="tw-book">⏰ {bookings.length} with a deadline / confirmation</span>
        </div>
      </header>

      <div className="tw-days">
        {days.map((d) => {
          const list = byDay[d.date] || [];
          return (
            <section key={d.date} className="tw-day">
              <div className="tw-day-head">
                <b>{d.date}</b>{d.legName ? <span className="tw-leg">{d.legName}</span> : null}
                <span className="tw-count">{list.length}</span>
              </div>
              {list.length === 0 ? <p className="tw-empty">— open day —</p> : (
                <ul className="tw-entries">
                  {list.map((e) => (
                    <li key={e.id} className={`tw-entry cat-${e.category || "activity"}`}
                        onClick={() => setEditing(e)} title="Edit entry">
                      <span className="tw-t">{entryTime(e)}</span>
                      <span className="tw-ico">{CAT_ICON[e.category] || "•"}</span>
                      <span className="tw-title">{e.title}
                        {e.place ? <em className="tw-place"> · {e.place.name}</em> : null}</span>
                      <span className="tw-tags">
                        {e.status && e.status !== "none" ? <span className={`tw-status s-${e.status}`}>{STATUS_LABEL[e.status] || e.status}</span> : null}
                        {e.cost?.amount != null ? <span className="tw-cost">{e.cost.cashOnly ? "💶 " : ""}{e.cost.currency === "EUR" ? "€" : e.cost.currency + " "}{e.cost.amount}</span> : null}
                        {(e.markers || []).map((m, i) => <span key={i} className="tw-marker" title={MARKER_TYPES?.[m.type]?.label || m.type}>{MARKER_TYPES?.[m.type]?.icon || "🔖"}</span>)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {editing ? (
        <EntryEditor tripId={tripId} entry={editing} onClose={() => setEditing(null)} />
      ) : null}
    </main>
  );
}
