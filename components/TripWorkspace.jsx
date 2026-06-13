"use client";

// The trip workspace body (/trips/[id]/[tab]) — the real v2 trip from
// trip_entries. The deck's IA (Plan · Days · Book · Shelf · Grid · Map · Frame)
// is URL-per-view: `activeTab` comes from the route, the top nav + sub-tabs live
// in AppShell (see TripWorkspaceRoute), and this renders ONE panel. No in-page
// tab state — switching views is navigation (project convention, #15). Click any
// entry to edit in the EntryEditor.
import { useMemo, useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTrips } from "./TripProvider";
import { tripDays, entriesByDay, cashNeeded, bookingsLedger } from "../lib/trip";
import { activeEntries, forkForDay } from "../lib/trip-variations";
import { CAT_ICON } from "./atoms";
import DayEntries from "./DayEntries";
import TripVariations from "./TripVariations";
import EntryEditor from "./EntryEditor";
import TripPlan from "./TripPlan";
import BookView from "./BookView";
import TripGrid from "./TripGrid";
import TripFrame from "./TripFrame";
import { solveTripDay } from "../lib/solve-adapter";

const TripMap = dynamic(() => import("./TripMapInner"), { ssr: false, loading: () => <p className="tw-stub">loading map…</p> });

function money(map) {
  return Object.entries(map || {}).map(([c, n]) => `${c === "EUR" ? "€" : c + " "}${n}`).join(" · ") || "—";
}

export default function TripWorkspace({ tripId, activeTab = "plan" }) {
  const { active, hydrated, addEntry, updateEntry, reorder } = useTrips();
  const tab = activeTab;
  const [editing, setEditing] = useState(null);
  const [solveMsg, setSolveMsg] = useState(null);
  const solveTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(solveTimerRef.current), []); // clear the solve-msg timer on unmount (#61)
  // Which day is in focus. On a phone the Days panel shows ONE day at a time
  // (the deck's "Today" view, #35) chosen from the date rail; on desktop the
  // rail is a jump-nav and every day stays visible. null → first day.
  const [focusDay, setFocusDay] = useState(null);

  // Create a blank entry on a day, then open it in the editor (addEntry returns
  // the row with its server-generated id, so the editor can patch it).
  async function addToDay(date) {
    // If this day sits inside a fork, tag the new entry to the fork's live
    // choice — so entries added while Option B is active build Option B (#34).
    const fork = forkForDay(trip, date);
    const option = fork ? { forkId: fork.id, choiceId: fork.activeChoiceId } : undefined;
    const saved = await addEntry(tripId, {
      day: date, role: "anchor", category: "activity", status: "none",
      title: "", time: { mode: "range" }, ...(option ? { option } : {}),
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
    clearTimeout(solveTimerRef.current);
    solveTimerRef.current = setTimeout(() => setSolveMsg(null), 6000);
  }

  // Add a typed entry and open it (stay/flight/own). Shelf items are undated.
  async function addAndEdit(fields) {
    if (!trip) return; // guard: addFlight/addStay can fire before hydration (#62)
    const saved = await addEntry(trip.id, { role: "anchor", status: "none", time: { mode: "bucket", bucket: "flex" }, title: "", ...fields });
    if (saved) setEditing(saved);
  }
  const addOwn = () => addAndEdit({ day: null, category: "activity" });

  const trip = active && active.id === tripId ? active : null;
  // The variation-filtered view: base entries + the live choice of each fork
  // (#34). Identical to `trip` when there are no forks, so existing trips are
  // unaffected. The read panels + rollups consume this; `trip` keeps the full
  // frame (legs, travelers, every fork's entries) for the Forks tab + editing.
  const vtrip = useMemo(() => (trip ? { ...trip, entries: activeEntries(trip) } : null), [trip]);
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const byDay = useMemo(() => (vtrip ? entriesByDay(vtrip) : {}), [vtrip]);
  const pool = useMemo(() => (vtrip ? vtrip.entries.filter((e) => !e.day) : []), [vtrip]);
  const flights = useMemo(() => (vtrip ? vtrip.entries.filter((e) => e.category === "travel" && (e.status === "booked" || e.booking?.confirmation)) : []), [vtrip]);
  const cash = useMemo(() => (vtrip ? cashNeeded(vtrip) : {}), [vtrip]);
  const bookings = useMemo(() => (vtrip ? bookingsLedger(vtrip) : []), [vtrip]);

  if (!trip) {
    return <div className="tw-wrap"><p className="tw-loading">{hydrated ? "Trip not found." : "Loading trip…"}</p></div>;
  }

  return (
    <div className="tw-wrap">
      <div className="tw-summary">
        <p className="tw-meta">{trip.startDate} – {trip.endDate} · {trip.legs?.length || 0} legs · {trip.entries.length} entries</p>
        <div className="tw-frame">
          {(trip.travelers || []).map((t) => (
            <span key={t.name} className="tw-trav">{t.kind === "pet" ? "🐾" : "🧑"} {t.name}{t.chips?.length ? <em> · {t.chips.join(", ")}</em> : null}</span>
          ))}
          {(trip.passes || []).map((p) => <span key={p.id} className="tw-pass">🎟 {p.name}</span>)}
        </div>
        <div className="tw-rollups">
          <span className="tw-cash">💰 cash needed: <b>{money(cash)}</b></span>
          <span className="tw-book">⏰ {bookings.length} with a deadline / confirmation</span>
        </div>
      </div>

      <div id="tw-panel">
      {tab === "plan" ? <TripPlan trip={vtrip} onEdit={setEditing} /> : null}

      {tab === "days" ? (
        <div className="tw-days">
          <nav className="tw-daynav" aria-label="Jump to day">
            {days.map((d) => {
              const on = (focusDay || days[0]?.date) === d.date;
              return (
                <button key={d.date} className={`tw-daychip${on ? " on" : ""}`} aria-current={on ? "true" : undefined}
                        onClick={() => { setFocusDay(d.date); document.getElementById(`day-${d.date}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                  <small>{d.date.slice(5, 7)}/{d.date.slice(8)}</small>
                  <i>{(byDay[d.date] || []).length || ""}</i>
                </button>
              );
            })}
          </nav>
          {days.map((d) => {
            const list = byDay[d.date] || [];
            const focused = (focusDay || days[0]?.date) === d.date;
            return (
              <section key={d.date} id={`day-${d.date}`} className={`tw-day${focused ? " focus" : ""}`}>
                <div className="tw-day-head"><b>{d.date}</b>{d.legName ? <span className="tw-leg">{d.legName}</span> : null}<span className="tw-count">{list.length}</span>
                  <button className="tw-solve" onClick={() => solveOneDay(d.date)} title="Lay out this day on the clock" disabled={!list.length}>⚡ solve</button>
                  <button className="tw-add" onClick={() => addToDay(d.date)} title="Add an entry to this day">＋ add</button>
                  {solveMsg && solveMsg.date === d.date ? <span className="tw-solvemsg" role="status" aria-live="polite">laid out {solveMsg.placed}{solveMsg.flags.length ? ` · ${solveMsg.flags.length} flag(s)` : " · fits"}</span> : null}</div>
                {solveMsg && solveMsg.date === d.date && solveMsg.flags.length ? (
                  <ul className="tw-flags">{solveMsg.flags.map((f, i) => <li key={i}>⚠ {f}</li>)}</ul>
                ) : null}
                {list.length === 0 ? <p className="tw-empty">— open day —</p> : (
                  <DayEntries tripId={tripId} day={d.date} list={list} onEdit={setEditing} onReorder={reorder} />
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "book" ? <BookView trip={vtrip} /> : null}
      {tab === "shelf" ? (
        <div className="sh">
          <div className="tw-shelf-head">
            <p className="tw-sec-label">The shelf — gathered candidates, not yet on a day. Lay them out, or open to edit.</p>
            <button className="tw-add" onClick={addOwn}>＋ add your own</button>
          </div>
          {pool.length === 0 ? (
            <p className="tw-stub">
              {trip.entries.length
                ? `Everything's on a day — all ${trip.entries.length} stops are placed, nothing waiting here. Gather more on the Plan tab to add to the shelf.`
                : "Nothing on the shelf yet. Gather suggestions on the Plan tab."}
            </p>
          ) : (
            <ul className="sh-list">
              {pool.map((e) => (
                <li key={e.id} className={`sh-item cat-${e.category || "activity"}`}>
                  <span className="tw-ico">{CAT_ICON[e.category] || "•"}</span>
                  <span className="sh-title" onClick={() => setEditing(e)}
                        role="button" tabIndex={0} aria-label={`Edit ${e.title}`}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setEditing(e); } }}>{e.title}{e.place ? <em> · {e.place.name}</em> : null}</span>
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
      {tab === "grid" ? <TripGrid trip={vtrip} onEdit={setEditing} /> : null}
      {tab === "map" ? <div className="tw-map"><TripMap trip={vtrip} /></div> : null}
      {tab === "frame" ? <TripFrame trip={vtrip} /> : null}
      {tab === "forks" ? <TripVariations trip={trip} /> : null}
      </div>

      {editing ? <EntryEditor tripId={tripId} entry={trip?.entries.find((e) => e.id === editing.id) || editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
