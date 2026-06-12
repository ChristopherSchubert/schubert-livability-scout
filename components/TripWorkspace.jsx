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
import TripGrid from "./TripGrid";
import { solveTripDay } from "../lib/solve-adapter";

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
  const { active, hydrated, enterTrip, addEntry, updateEntry } = useTrips();
  const [tab, setTab] = useState("Plan");
  const [editing, setEditing] = useState(null);
  const [solveMsg, setSolveMsg] = useState(null);

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

  // Solve a day: lay its placeable entries into a clocked, travel-aware schedule
  // (lib/solve-adapter → solveDay). Booked entries stay pinned; the rest get
  // times. Lodging = the leg's stay (for travel-to/from-base legs).
  function solveOneDay(date) {
    const list = byDay[date] || [];
    if (!list.length) return;
    const leg = (trip.legs || []).find((l) => l.arrive <= date && date <= l.depart);
    const stayE = trip.entries.find((e) => e.category === "stay" && e.place?.lat != null && leg && e.day >= leg.arrive && e.day <= leg.depart);
    const lodging = stayE?.place ? { lat: stayE.place.lat, lon: stayE.place.lon, name: stayE.place.name } : null;
    const { times, flags } = solveTripDay(list, { lodging });
    let placed = 0;
    for (const e of list) {
      const t = times[e.id];
      if (t) { updateEntry(trip.id, { ...e, time: { mode: "range", start: t.start, end: t.end } }); placed++; }
    }
    setSolveMsg({ date, placed, flags });
    setTimeout(() => setSolveMsg(null), 6000);
  }

  const trip = active && active.id === tripId ? active : null;
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const byDay = useMemo(() => (trip ? entriesByDay(trip) : {}), [trip]);
  const pool = useMemo(() => (trip ? trip.entries.filter((e) => !e.day) : []), [trip]);
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
            {t === "Shelf" && pool.length ? <i className="tw-badge">{pool.length}</i> : null}
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
                  <button className="tw-solve" onClick={() => solveOneDay(d.date)} title="Lay out this day on the clock" disabled={!list.length}>⚡ solve</button>
                  <button className="tw-add" onClick={() => addToDay(d.date)} title="Add an entry to this day">＋ add</button>
                  {solveMsg && solveMsg.date === d.date ? <span className="tw-solvemsg">laid out {solveMsg.placed}{solveMsg.flags.length ? ` · ${solveMsg.flags.length} flag(s)` : ""}</span> : null}</div>
                {list.length === 0 ? <p className="tw-empty">— open day —</p> : (
                  <ul className="tw-entries">{list.map((e) => <EntryRow key={e.id} e={e} onEdit={setEditing} />)}</ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "Book" ? <BookView trip={trip} /> : null}
      {tab === "Shelf" ? (
        <div className="sh">
          <p className="tw-sec-label">The shelf — gathered candidates, not yet on a day. Lay them out, or open to edit.</p>
          {pool.length === 0 ? <p className="tw-stub">Nothing on the shelf. Gather suggestions on the Plan tab.</p> : (
            <ul className="sh-list">
              {pool.map((e) => (
                <li key={e.id} className={`sh-item cat-${e.category || "activity"}`}>
                  <span className="tw-ico">{CAT_ICON[e.category] || "•"}</span>
                  <span className="sh-title" onClick={() => setEditing(e)}>{e.title}{e.place ? <em> · {e.place.name}</em> : null}</span>
                  <span className="sh-actions">
                    {days.map((d) => (
                      <button key={d.date} className="sh-place" title={`Place on ${d.date}`}
                              onClick={() => updateEntry(trip.id, { ...e, day: d.date })}>{d.date.slice(5)}</button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {tab === "Grid" ? <TripGrid trip={trip} onEdit={setEditing} /> : null}

      {editing ? <EntryEditor tripId={tripId} entry={editing} onClose={() => setEditing(null)} /> : null}
    </main>
  );
}
