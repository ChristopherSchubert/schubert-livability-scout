"use client";

// The trip workspace body (/trips/[id]/[tab]) — the real v2 trip from
// trip_entries. The deck's IA (Plan · Days · Book · Shelf · Grid · Map · Frame)
// is URL-per-view: `activeTab` comes from the route, the top nav + sub-tabs live
// in AppShell (see TripWorkspaceRoute), and this renders ONE panel. No in-page
// tab state — switching views is navigation (project convention, #15). Click any
// entry to edit in the EntryEditor.
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTrips } from "./TripProvider";
import { tripDays, entriesByDay, cashNeeded, bookingsLedger } from "../lib/trip";
import { CAT_ICON } from "./atoms";
import DayEntries from "./DayEntries";
import EntryEditor from "./EntryEditor";
import TripWindow from "./TripWindow";
import BookView from "./BookView";
import GatherBucket from "./GatherBucket";
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

  // Add a typed entry and open it (stay/flight/own). Shelf items are undated.
  async function addAndEdit(fields) {
    const saved = await addEntry(trip.id, { role: "anchor", status: "none", time: { mode: "bucket", bucket: "flex" }, title: "", ...fields });
    if (saved) setEditing(saved);
  }
  const addStay = (leg) => addAndEdit({ day: leg.arrive, category: "stay", status: "reserved", role: "connective", title: `Stay — ${leg.name?.replace(/,.*$/, "")}`, time: { mode: "point" } });
  const addFlight = () => addAndEdit({ day: trip.startDate, category: "travel", status: "booked", role: "connective", title: "Flight" });
  const addOwn = () => addAndEdit({ day: null, category: "activity" });

  const trip = active && active.id === tripId ? active : null;
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const byDay = useMemo(() => (trip ? entriesByDay(trip) : {}), [trip]);
  const pool = useMemo(() => (trip ? trip.entries.filter((e) => !e.day) : []), [trip]);
  const flights = useMemo(() => (trip ? trip.entries.filter((e) => e.category === "travel" && (e.status === "booked" || e.booking?.confirmation)) : []), [trip]);
  const cash = useMemo(() => (trip ? cashNeeded(trip) : {}), [trip]);
  const bookings = useMemo(() => (trip ? bookingsLedger(trip) : []), [trip]);

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
          <span className="tw-cash">💶 cash needed: <b>{money(cash)}</b></span>
          <span className="tw-book">⏰ {bookings.length} with a deadline / confirmation</span>
        </div>
      </div>

      <div id="tw-panel">
      {tab === "plan" ? (
        <div className="tw-plan">
          <div className="tw-sec-label">The window</div>
          <TripWindow trip={trip} />
          <div className="tw-sec-label">Flights &amp; transport</div>
          <ul className="tw-stays">
            {flights.map((e) => (
              <li key={e.id} className="tw-flight" onClick={() => setEditing(e)}
                  role="button" tabIndex={0} aria-label={`Edit ${e.title}`}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setEditing(e); } }}>
                <span className="tw-ico">✈</span>
                <b>{e.title}</b>
                <span className="tw-meta">{e.day}{e.time?.start ? ` · ${e.time.start}` : ""}</span>
                {e.booking?.confirmation ? <span className="tw-status s-booked">{e.booking.confirmation}</span> : null}
              </li>
            ))}
            <li><button className="tw-add" onClick={addFlight}>＋ add flight</button></li>
          </ul>
          <div className="tw-sec-label">Stays</div>
          <ul className="tw-stays">
            {(trip.legs || []).map((leg) => {
              const stay = trip.entries.find((e) => e.category === "stay" && (byDay[leg.arrive] || []).includes(e));
              return (
                <li key={leg.cityId || leg.name} className="tw-stay">
                  <div className="tw-stay-top">
                    <b>{leg.name?.replace(/,.*$/, "")}</b>
                    <span className="tw-meta">{leg.arrive} – {leg.depart}</span>
                    <span className="tw-stay-h tw-clickable" onClick={() => (stay ? setEditing(stay) : addStay(leg))}
                          role="button" tabIndex={0} aria-label={stay ? `Edit stay ${stay.title}` : `Add stay in ${leg.name}`}
                          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); stay ? setEditing(stay) : addStay(leg); } }}>
                      {stay ? stay.title.replace(/^Check in\s*—?\s*/i, "") : "＋ add stay"}</span>
                  </div>
                  <GatherBucket trip={trip} leg={leg} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "days" ? (
        <div className="tw-days">
          {days.map((d) => {
            const list = byDay[d.date] || [];
            return (
              <section key={d.date} className="tw-day">
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

      {tab === "book" ? <BookView trip={trip} /> : null}
      {tab === "shelf" ? (
        <div className="sh">
          <div className="tw-shelf-head">
            <p className="tw-sec-label">The shelf — gathered candidates, not yet on a day. Lay them out, or open to edit.</p>
            <button className="tw-add" onClick={addOwn}>＋ add your own</button>
          </div>
          {pool.length === 0 ? <p className="tw-stub">Nothing on the shelf. Gather suggestions on the Plan tab.</p> : (
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
      {tab === "grid" ? <TripGrid trip={trip} onEdit={setEditing} /> : null}
      {tab === "map" ? <div className="tw-map"><TripMap trip={trip} /></div> : null}
      {tab === "frame" ? <TripFrame trip={trip} /> : null}
      </div>

      {editing ? <EntryEditor tripId={tripId} entry={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
