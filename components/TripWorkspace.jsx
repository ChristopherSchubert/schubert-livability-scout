"use client";

// The trip page (/trips/[id]) — the real v2 trip from trip_entries, with the
// deck's tab IA: Plan · Days · Book · Shelf · Grid. Plan = the window + stays;
// Days = the day-by-day agenda; Book = derived reservations/cash. Shelf/Grid
// are stubs (Phase 1/2 follow-ups). Click any entry to edit in the EntryEditor.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTrips } from "./TripProvider";
import { tripDays, entriesByDay, cashNeeded, bookingsLedger, MARKER_TYPES } from "../lib/trip";
import EntryEditor from "./EntryEditor";
import TripWindow from "./TripWindow";
import BookView from "./BookView";
import GatherBucket from "./GatherBucket";

const TABS = ["Plan", "Days", "Book", "Shelf", "Grid"];
const CAT_ICON = { travel: "🚆", meal: "🍴", activity: "🥾", stay: "🛏", errand: "🧾" };
const STATUS_LABEL = { booked: "booked", reserved: "held", toBook: "to book", none: "" };

function money(map) {
  return Object.entries(map || {}).map(([c, n]) => `${c === "EUR" ? "€" : c + " "}${n}`).join(" · ") || "—";
}
function entryTime(e) {
  const t = e.time || {};
  if (t.mode === "range" && t.start) return t.end ? `${t.start}–${t.end}` : t.start;
  if (t.mode === "point" && t.at) return t.at;
  return "";
}

function EntryRow({ e, onEdit }) {
  return (
    <li className={`tw-entry cat-${e.category || "activity"}`} onClick={() => onEdit(e)} title="Edit entry">
      <span className="tw-t">{entryTime(e)}</span>
      <span className="tw-ico">{CAT_ICON[e.category] || "•"}</span>
      <span className="tw-title">{e.title}{e.place ? <em className="tw-place"> · {e.place.name}</em> : null}</span>
      <span className="tw-tags">
        {e.status && e.status !== "none" ? <span className={`tw-status s-${e.status}`}>{STATUS_LABEL[e.status] || e.status}</span> : null}
        {e.cost?.amount != null ? <span className="tw-cost">{e.cost.cashOnly ? "💶 " : ""}{e.cost.currency === "EUR" ? "€" : e.cost.currency + " "}{e.cost.amount}</span> : null}
        {(e.markers || []).map((m, i) => <span key={i} className="tw-marker" title={MARKER_TYPES?.[m.type]?.label || m.type}>{MARKER_TYPES?.[m.type]?.icon || "🔖"}</span>)}
      </span>
    </li>
  );
}

export default function TripWorkspace({ tripId }) {
  const { active, hydrated, enterTrip, addEntry } = useTrips();
  const [tab, setTab] = useState("Plan");
  const [editing, setEditing] = useState(null);

  useEffect(() => { if (tripId) enterTrip(tripId); }, [tripId]); // eslint-disable-line

  // Create a blank entry on a day, then open it in the editor (addEntry returns
  // the row with its server-generated id, so the editor can patch it).
  async function addToDay(date) {
    const saved = await addEntry(tripId, {
      day: date, role: "anchor", category: "activity", status: "none",
      title: "", time: { mode: "range" },
    });
    if (saved) setEditing(saved);
  }

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
        <p className="tw-meta">{trip.startDate} – {trip.endDate} · {trip.legs?.length || 0} legs · {trip.entries.length} entries</p>
        <div className="tw-frame">
          {(trip.travelers || []).map((t) => (
            <span key={t.name} className="tw-trav">{t.kind === "pet" ? "🐾" : "🧑"} {t.name}{t.chips?.length ? <em> · {t.chips.join(", ")}</em> : null}</span>
          ))}
          {(trip.passes || []).map((p) => <span key={p.id} className="tw-pass">🎟 {p.name}</span>)}
        </div>
        <div className="tw-rollups">
          <span className="tw-cash">💶 cash needed: <b>{money(cash)}</b></span>
          <span className="tw-book">⏰ {bookings.length} with a deadline / confirmation</span>
        </div>
      </header>

      <nav className="tw-tabs">
        {TABS.map((t) => (
          <button key={t} className={`tw-tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
            {t}{t === "Book" && bookings.length ? <i className="tw-badge">{bookings.length}</i> : null}
          </button>
        ))}
      </nav>

      {tab === "Plan" ? (
        <div className="tw-plan">
          <div className="tw-sec-label">The window</div>
          <TripWindow trip={trip} />
          <div className="tw-sec-label">Stays</div>
          <ul className="tw-stays">
            {(trip.legs || []).map((leg) => {
              const stay = trip.entries.find((e) => e.category === "stay" && (byDay[leg.arrive] || []).includes(e));
              return (
                <li key={leg.cityId || leg.name} className="tw-stay">
                  <div className="tw-stay-top">
                    <b>{leg.name?.replace(/,.*$/, "")}</b>
                    <span className="tw-meta">{leg.arrive} – {leg.depart}</span>
                    <span className="tw-stay-h">{stay ? stay.title.replace(/^Check in\s*—?\s*/i, "") : "— no stay —"}</span>
                  </div>
                  <GatherBucket trip={trip} leg={leg} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "Days" ? (
        <div className="tw-days">
          {days.map((d) => {
            const list = byDay[d.date] || [];
            return (
              <section key={d.date} className="tw-day">
                <div className="tw-day-head"><b>{d.date}</b>{d.legName ? <span className="tw-leg">{d.legName}</span> : null}<span className="tw-count">{list.length}</span>
                  <button className="tw-add" onClick={() => addToDay(d.date)} title="Add an entry to this day">＋ add</button></div>
                {list.length === 0 ? <p className="tw-empty">— open day —</p> : (
                  <ul className="tw-entries">{list.map((e) => <EntryRow key={e.id} e={e} onEdit={setEditing} />)}</ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "Book" ? <BookView trip={trip} /> : null}
      {tab === "Shelf" ? <p className="tw-stub">Shelf — the trip-wide pool + alternates. Coming next (#26).</p> : null}
      {tab === "Grid" ? <p className="tw-stub">Grid — the generated printable grid, one leg per page. Phase 2 (#29).</p> : null}

      {editing ? <EntryEditor tripId={tripId} entry={editing} onClose={() => setEditing(null)} /> : null}
    </main>
  );
}
