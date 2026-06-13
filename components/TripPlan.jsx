"use client";

// TripPlan — the Plan tab, rebuilt to the walkthrough deck's focus interaction
// (Slovenia deck §8–9). The Plan page has two states:
//
//   Overview — the window, a collapsed Flights one-liner, and Stays drawn as a
//   row of width-proportional bars (one per leg). Nothing blooms; you scan the
//   shape of the trip.
//
//   Focus — click a leg (in the window or its stay bar) and the page focuses
//   that city: Flights + Stays fold to one-line bars, and the city opens with
//   its day columns and ONE bucket (the want-list). The bucket gathers
//   candidates (GatherBucket → Google Places cache), holds your own additions,
//   and "Lay out →" spreads the undated items across the city's open days.
//
// This replaces the old always-expanded list where every leg's suggestion tray
// rendered at once — the wall the deck was designed to avoid.
import { useMemo, useState } from "react";
import { useTrips } from "./TripProvider";
import { tripDays, entriesByDay, tripDietChips } from "../lib/trip";
import { CAT_ICON, MealScreen } from "./atoms";
import GatherBucket from "./GatherBucket";
import TripWindow from "./TripWindow";

const legKey = (leg) => leg?.cityId || leg?.name || "";
const cityName = (leg) => (leg?.name || "").split(",")[0] || "—";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (ymd) => (ymd ? DOW[new Date(ymd + "T00:00:00").getDay()] : "");

// Transport entries are mixed (flights + inter-city drives). The Flights
// section lists them all (a real itinerary has both); the per-row glyph keeps
// each honest — ✈ for air, 🚆 otherwise — rather than calling a drive a flight.
const AIR_RE = /\b(fly|flight|airport|boarding|fligh)/i;
const transportGlyph = (e) => (AIR_RE.test(e.title || "") ? "✈" : "🚆");

// ~hours a bucket holds, honest-rough: each item ≈ 2h. Shown as a "~Xh" hint,
// never persisted — it's a fullness cue for "enough to lay out yet?", not data.
const HOURS_PER_ITEM = 2;

export default function TripPlan({ trip, onEdit }) {
  const { addEntry, updateEntry, removeEntry } = useTrips();
  const [focus, setFocus] = useState(null); // legKey of the focused city, or null
  const [flightsOpen, setFlightsOpen] = useState(false);

  const legs = trip.legs || [];
  const days = useMemo(() => tripDays(trip), [trip]);
  const byDay = useMemo(() => entriesByDay(trip), [trip]);
  const dietChips = useMemo(() => tripDietChips(trip), [trip]);
  // Every transport entry — booked or not. The old filter gated on
  // booked/confirmation, so a real trip's unbooked travel rows vanished and the
  // section read "none yet" on a packed itinerary (rank 2). Unbooked is shown
  // inline, never hidden.
  const flights = useMemo(() => trip.entries.filter((e) => e.category === "travel"), [trip]);
  const stayCount = useMemo(() => trip.entries.filter((e) => e.category === "stay").length, [trip]);
  const pool = useMemo(() => trip.entries.filter((e) => !e.day), [trip]);

  const legDays = (leg) => days.filter((d) => d.date >= leg.arrive && d.date <= leg.depart);
  const nights = (leg) => Math.max(1, legDays(leg).length);
  const stayFor = (leg) => trip.entries.find((e) => e.category === "stay" && e.day >= leg.arrive && e.day <= leg.depart);
  // The bucket = undated candidates tagged to this city (GatherBucket saves with
  // legHint = cityId; "add your own" does the same). Legacy untagged pool items
  // surface only on the Shelf, never in a city bucket.
  const bucketFor = (leg) => pool.filter((e) => e.legHint && e.legHint === leg.cityId);

  const focused = legs.find((l) => legKey(l) === focus) || null;

  // Lay out a city: spread its undated bucket items across the city's open days,
  // always topping up the emptiest day next. Placement only — times come from
  // ⚡ Solve on the Days tab. This is the honest core of the deck's "Lay out →".
  async function layOut(leg) {
    const ld = legDays(leg);
    if (!ld.length) return;
    const counts = ld.map((d) => (byDay[d.date] || []).length);
    for (const item of bucketFor(leg)) {
      let mi = 0;
      for (let i = 1; i < counts.length; i++) if (counts[i] < counts[mi]) mi = i;
      counts[mi] += 1;
      // eslint-disable-next-line no-await-in-loop
      await updateEntry(trip.id, { ...item, day: ld[mi].date });
    }
  }

  async function addOwn(leg) {
    const saved = await addEntry(trip.id, {
      day: null, role: "anchor", category: "activity", status: "none",
      title: "", time: { mode: "bucket", bucket: "flex" }, legHint: leg.cityId || null,
    });
    if (saved) onEdit(saved);
  }

  return (
    <div className="tw-plan">
      <div className="tw-sec-label">The window</div>
      <TripWindow trip={trip} focus={focus} onFocus={setFocus} />

      {focused ? (
        <>
          <button className="tw-collapsec" onClick={() => setFocus(null)} aria-label="Back to all cities">
            ← <b>All cities</b> · Flights {flights.length} ✈ · Stays {stayCount} 🛏
          </button>
          <FocusCity
            leg={focused} days={legDays(focused)} byDay={byDay} stay={stayFor(focused)}
            bucket={bucketFor(focused)} trip={trip} onEdit={onEdit} onRemove={removeEntry}
            onLayOut={() => layOut(focused)} onAddOwn={() => addOwn(focused)}
            dietChips={dietChips}
          />
        </>
      ) : (
        <>
          <button className="tw-collapsec" onClick={() => setFlightsOpen((o) => !o)}
                  aria-expanded={flightsOpen} aria-label="Toggle flights">
            {flightsOpen ? "▾" : "▸"} <b>Flights</b> · {flights.length ? `${flights.length} ✈` : "none yet"}
          </button>
          {flightsOpen && flights.length ? (
            <ul className="tw-stays tw-flights-open">
              {flights.map((e) => (
                <li key={e.id} className="tw-flight" onClick={() => onEdit(e)}
                    role="button" tabIndex={0} aria-label={`Edit ${e.title}`}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEdit(e); } }}>
                  <span className="tw-ico">{transportGlyph(e)}</span>
                  <b>{e.title}</b>
                  <span className="tw-meta">{e.day}{e.time?.start ? ` · ${e.time.start}` : ""}</span>
                  {e.booking?.confirmation
                    ? <span className="tw-status s-booked">{e.booking.confirmation}</span>
                    : e.status !== "booked" ? <span className="tw-status">unbooked</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="tw-sec-label">Stays · click a city to plan it</div>
          <div className="tw-staysrow">
            {legs.map((leg) => {
              const stay = stayFor(leg);
              return (
                <button key={legKey(leg)} className="tw-staybar" style={{ flex: nights(leg) }}
                        onClick={() => setFocus(legKey(leg))} aria-label={`Plan ${cityName(leg)}`}>
                  <b>{cityName(leg)}</b>
                  <small>{nights(leg)}n{stay ? " · 🛏" : ""}</small>
                </button>
              );
            })}
          </div>
          <p className="tw-plan-hint">Pick a city above to gather its bucket and lay out its days.</p>
        </>
      )}
    </div>
  );
}

// The focused city: its header, day columns, and the one bucket.
function FocusCity({ leg, days, byDay, stay, bucket, trip, onEdit, onRemove, onLayOut, onAddOwn, dietChips }) {
  const open = days.length;
  const hours = bucket.length * HOURS_PER_ITEM;
  const ready = bucket.length >= Math.max(2, open);
  return (
    <>
      <div className="tw-focus-head">
        <b>{cityName(leg)}</b>
        <span className="tw-meta">{leg.arrive} – {leg.depart} · {days.length}d{stay ? ` · ${stay.title.replace(/^Check in\s*—?\s*/i, "")}` : ""}</span>
      </div>

      <div className="tw-daycols-wrap">
        <div className="tw-daycols" style={{ gridTemplateColumns: `repeat(${Math.max(1, days.length)}, minmax(120px, 1fr))` }}>
          {days.map((d) => {
            const list = byDay[d.date] || [];
            const marker = d.date === leg.arrive ? "arrive" : d.date === leg.depart ? "depart" : "";
            const fill = Math.min(100, list.length * 28);
            return (
              <div key={d.date} className="tw-daycol">
                <div className="tw-dh"><span>{dow(d.date)} {d.date.slice(8)}</span>{marker ? <small>{marker}</small> : null}</div>
                {list.map((e) => (
                  <div key={e.id} className={`tw-mini cat-${e.category || "activity"}`} onClick={() => onEdit(e)}
                       role="button" tabIndex={0} aria-label={`Edit ${e.title || "entry"}`}
                       onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEdit(e); } }}>
                    <b>{CAT_ICON[e.category] || "•"} {e.title || "untitled"}</b>
                    <MealScreen entry={e} dietChips={dietChips} />
                  </div>
                ))}
                <div className="tw-cap"><i style={{ width: `${fill}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tw-bucket">
        <div className="tw-bucket-head">
          <b>{cityName(leg)} bucket</b>
          <span className="tw-ready">
            {bucket.length
              ? <><b>{bucket.length} item{bucket.length === 1 ? "" : "s"} · ~{hours}h</b> · {open} open day{open === 1 ? "" : "s"}{ready ? " · enough to lay out" : ""}</>
              : "empty — the want-list for this city"}
          </span>
          {bucket.length ? <button className="tw-layout" onClick={onLayOut}>Lay out {cityName(leg)} →</button> : null}
        </div>

        {bucket.length ? (
          <div className="tw-cardrow">
            {bucket.map((e) => (
              <div key={e.id} className={`tw-mini has-acts cat-${e.category || "activity"}`}>
                <span className="tw-iacts">
                  <i role="button" tabIndex={0} title="edit" aria-label={`Edit ${e.title || "item"}`}
                     onClick={() => onEdit(e)}
                     onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEdit(e); } }}>✎</i>
                  <i role="button" tabIndex={0} title="remove" aria-label={`Remove ${e.title || "item"}`}
                     onClick={() => onRemove(e.id)}
                     onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onRemove(e.id); } }}>✕</i>
                </span>
                <b>{CAT_ICON[e.category] || "•"} {e.title || "untitled"}</b>
                {e.place?.name && e.place.name !== e.title ? <small>{e.place.name}</small> : null}
                <MealScreen entry={e} dietChips={dietChips} />
              </div>
            ))}
          </div>
        ) : null}

        <div className="tw-toolrow">
          <GatherBucket trip={trip} leg={leg} />
          <button className="tw-add" onClick={onAddOwn}>＋ add your own</button>
          {!bucket.length ? <span className="tw-plan-hint">booked &amp; dated things skip the bucket — they place themselves</span> : null}
        </div>
      </div>
    </>
  );
}
