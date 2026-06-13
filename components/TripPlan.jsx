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
import { usePlanner } from "./PlannerProvider";
import { tripDays, entriesByDay, tripDietChips } from "../lib/trip";
import { appendCityLeg, daysBetween } from "../lib/trip-window";
import { CAT_ICON, MealScreen } from "./atoms";
import GatherBucket from "./GatherBucket";
import TripWindow from "./TripWindow";
import StaySearch from "./StaySearch";

const legKey = (leg) => leg?.cityId || leg?.name || "";
const cityName = (leg) => (leg?.name || "").split(",")[0] || "—";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (ymd) => (ymd ? DOW[new Date(ymd + "T00:00:00").getDay()] : "");

// Transport entries are mixed (flights + inter-city drives). The Flights
// section lists them all (a real itinerary has both); the per-row glyph keeps
// each honest — ✈ for air, 🚆 otherwise — rather than calling a drive a flight.
const AIR_RE = /\b(fly|flight|airport|boarding|fligh)/i;
const transportGlyph = (e) => (AIR_RE.test(e.title || "") ? "✈" : "🚆");
// Strip bookkeeping prefixes ("Stay —", "Check in —", "Check out —") so the
// stay bar reads as the hotel name, not the entry's clerical title.
const stayName = (t) => (t || "").replace(/^(Stay|Check[\s-]*(?:in|out))\s*[—–-]?\s*/i, "");

// ~hours a bucket holds, honest-rough: each item ≈ 2h. Shown as a "~Xh" hint,
// never persisted — it's a fullness cue for "enough to lay out yet?", not data.
const HOURS_PER_ITEM = 2;

export default function TripPlan({ trip, onEdit }) {
  const { addEntry, updateEntry, removeEntry, updateTripFrame } = useTrips();
  const { planner } = usePlanner();
  const [focus, setFocus] = useState(null); // legKey of the focused city, or null
  const [flightsOpen, setFlightsOpen] = useState(false);
  // legKey whose hotel search is currently open in the overview stay bar.
  // Clicking "Search hotels" on a bar focuses that leg AND opens StaySearch
  // inline in FocusCity, so we just call setFocus — the search panel renders
  // inside the focused view. The bar button triggers the focus transition.
  const [staySearchLeg, setStaySearchLeg] = useState(null); // legKey
  // "＋ other city" search state
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherQuery, setOtherQuery] = useState("");
  const [otherResults, setOtherResults] = useState([]);
  const [otherBusy, setOtherBusy] = useState(false);
  const [otherErr, setOtherErr] = useState("");

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

  // Atlas cities not already on the itinerary (strict data rule: sourced only
  // from planner.cities — never a ranking/popularity query, so the provenance
  // claim in the srcline is literally true).
  const legCityIds = useMemo(() => new Set(legs.map((l) => l.cityId).filter(Boolean)), [legs]);
  // The tray = scouted Atlas cities NEAR this trip, not the whole atlas. A trip
  // in Slovenia shouldn't surface 119 US cities — only places within reach of
  // its region (sorted nearest-first, capped). Far-flung or coordless trips
  // fall back to a short alphabetical slice; ＋ other city covers the rest.
  const scoutCities = useMemo(() => {
    const all = (planner.cities || []).filter((c) => c.id && !legCityIds.has(c.id) && c.lat != null && c.lon != null);
    const anchors = legs
      .map((l) => (planner.cities || []).find((c) => c.id === l.cityId))
      .filter((c) => c && c.lat != null);
    if (!anchors.length) return all.slice(0, 12);
    const km = (a, b) => {
      const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    const near = (c) => Math.min(...anchors.map((a) => km(a, c)));
    return all
      .map((c) => ({ c, d: near(c) }))
      .filter((x) => x.d <= 400) // ~within a few hours of the trip's region
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((x) => x.c);
  }, [planner.cities, legCityIds, legs]);

  // Can we donate 1 calendar day to a new leg?  The longest leg must have
  // daysBetween(arrive, depart) ≥ 1 (span ≥ 2 calendar days). If no leg
  // qualifies, add-city chips are disabled with a tooltip.
  const canAddCity = useMemo(() => {
    if (legs.length === 0) return !!trip.startDate && !!trip.endDate;
    return legs.some((l) => daysBetween(l.arrive, l.depart) >= 1);
  }, [legs, trip.startDate, trip.endDate]);

  // Append a city (from Atlas or "other city" search) as a new leg.
  function addCityLeg(city) {
    const { legs: next, error } = appendCityLeg(legs, city, trip.startDate, trip.endDate);
    if (error) { alert(error); return; }
    updateTripFrame(trip.id, { legs: next });
  }

  // "＋ other city" place search.
  async function searchOther() {
    const q = otherQuery.trim();
    if (!q) return;
    setOtherBusy(true);
    setOtherErr("");
    setOtherResults([]);
    try {
      const r = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 6 }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setOtherResults(j.results || []);
    } catch (e) {
      setOtherErr(e.message || "Search failed");
    } finally {
      setOtherBusy(false);
    }
  }

  function pickOther(candidate) {
    addCityLeg({
      cityId: null,
      name: candidate.name,
      lat: candidate.lat ?? null,
      lon: candidate.lon ?? null,
    });
    setOtherOpen(false);
    setOtherQuery("");
    setOtherResults([]);
  }

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

  // No-nights-free tooltip (shown when all legs are at minimum span).
  const noNightsMsg = "no nights free — extend the trip first";

  return (
    <div className="tw-plan">
      <div className="tw-sec-label">The window</div>

      {/* Empty-window dropzone — shown when no legs exist yet */}
      {legs.length === 0 ? (
        <div className="twn-empty-drop">
          <span>Add a city below to start building your trip</span>
        </div>
      ) : (
        <TripWindow trip={trip} focus={focus} onFocus={setFocus} />
      )}

      {/* Provenance line — always visible in overview (Janice #3 deliverable).
          Deck wording: "the places you scouted … in your Atlas — not a preference
          guess, not a popularity list." Always rendered in overview (not focused). */}
      {!focused && (
        <p className="tw-prov">
          the places <b>you</b> scouted in your Atlas — not a preference guess, not a popularity list
          · ＋ other city adds anything you haven't scouted
        </p>
      )}

      {/* Cities-from-the-scout tray — Atlas cities not yet on the itinerary */}
      {!focused && (
        <div className="tw-citytray" aria-label="Your scouted Atlas cities">
          {scoutCities.length === 0 ? (
            <span className="tw-prov" style={{ margin: 0 }}>no scouted places near this trip —</span>
          ) : null}
          {scoutCities.map((c) => (
            <button
              key={c.id}
              className="tw-citychip"
              disabled={!canAddCity}
              title={canAddCity ? `Add ${c.name} to your trip` : noNightsMsg}
              aria-label={`Add ${c.name} to trip`}
              onClick={() => addCityLeg({ cityId: c.id, name: c.name, lat: c.lat, lon: c.lon })}
            >
              {(c.name || "").split(",")[0]}
            </button>
          ))}
          {/* ＋ other city — place search for cities not in the Atlas */}
          {otherOpen ? (
            <div className="tw-citytray-other">
              <div className="tw-citytray-other-bar">
                <input
                  className="tw-citytray-other-input"
                  value={otherQuery}
                  placeholder="Search any city…"
                  autoFocus
                  onChange={(e) => setOtherQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchOther(); if (e.key === "Escape") setOtherOpen(false); }}
                  aria-label="Search for a city not in your Atlas"
                />
                <button className="ss-go" onClick={searchOther} disabled={otherBusy}>{otherBusy ? "…" : "Search"}</button>
                <button className="ee-mini" onClick={() => { setOtherOpen(false); setOtherResults([]); setOtherErr(""); }}>✕</button>
              </div>
              {otherErr && <p className="ss-err">{otherErr}</p>}
              {otherResults.length > 0 && (
                <div className="tw-citytray-other-results">
                  {otherResults.map((c) => (
                    <button key={c.placeId || c.name} className="tw-citytray-other-result"
                            onClick={() => pickOther(c)}>
                      <b>{c.name}</b>
                      {c.address ? <small>{c.address}</small> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              className="tw-citytray-add"
              disabled={!canAddCity}
              title={canAddCity ? "Add a city not in your Atlas" : noNightsMsg}
              aria-label="Add a city not in your Atlas"
              onClick={() => setOtherOpen(true)}
            >
              ＋ other city…
            </button>
          )}
        </div>
      )}

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
            staySearchOpen={staySearchLeg === legKey(focused)}
            onOpenStaySearch={() => setStaySearchLeg(legKey(focused))}
            onCloseStaySearch={() => setStaySearchLeg(null)}
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
              const lk = legKey(leg);
              if (stay) {
                // Filled stay bar: city + stay name, clicking focuses the leg.
                return (
                  <button key={lk} className="tw-staybar" style={{ flex: nights(leg) }}
                          onClick={() => setFocus(lk)} aria-label={`Plan ${cityName(leg)}`}>
                    <b>{cityName(leg)}</b>
                    <small>{nights(leg)}n · 🛏 {stayName(stay.title)}</small>
                  </button>
                );
              }
              // Empty stay bar: dashed, offers "🔍 Search hotels" affordance.
              return (
                <button key={lk} className="tw-staybar tw-staybar-empty" style={{ flex: nights(leg) }}
                        onClick={() => { setFocus(lk); setStaySearchLeg(lk); }}
                        aria-label={`Search hotels for ${cityName(leg)}`}>
                  <span className="tw-staybar-slot-btn">🔍 Search hotels</span>
                  <small>{cityName(leg)} · {nights(leg)}n</small>
                </button>
              );
            })}
          </div>
          {legs.length > 0 && <p className="tw-plan-hint">Pick a city above to gather its bucket and lay out its days.</p>}
        </>
      )}
    </div>
  );
}

// The focused city: its header (with stay slot / StaySearch), day columns,
// and the one bucket.
function FocusCity({ leg, days, byDay, stay, bucket, trip, onEdit, onRemove, onLayOut, onAddOwn,
                     dietChips, staySearchOpen, onOpenStaySearch, onCloseStaySearch }) {
  const open = days.length;
  const hours = bucket.length * HOURS_PER_ITEM;
  const ready = bucket.length >= Math.max(2, open);

  // When a stay is just placed via StaySearch, open it in EntryEditor for
  // booking details and close the search panel.
  function handleStayPlaced(saved) {
    onCloseStaySearch();
    onEdit(saved);
  }

  return (
    <>
      <div className="tw-focus-head">
        <b>{cityName(leg)}</b>
        <span className="tw-meta">{leg.arrive} – {leg.depart} · {days.length}d</span>
        {stay ? (
          <span className="tw-stay-placed">
            🛏 <button className="tw-stay-name tw-clickable" onClick={() => onEdit(stay)}
                        aria-label={`Edit stay: ${stay.title}`}>
              {stayName(stay.title)}
            </button>
            <button className="ee-mini" onClick={onOpenStaySearch} aria-label="Change hotel">
              change hotel
            </button>
          </span>
        ) : (
          <button className="tw-add" onClick={onOpenStaySearch} aria-label={`Search hotels for ${cityName(leg)}`}>
            🔍 Search hotels
          </button>
        )}
      </div>

      {staySearchOpen ? (
        <div className="ss-focus-wrap">
          <div className="ss-focus-hd">
            <span className="ss-focus-label">stays · {cityName(leg)} · {leg.arrive} – {leg.depart}</span>
            <button className="ee-mini" onClick={onCloseStaySearch} aria-label="Close hotel search">✕ close</button>
          </div>
          <StaySearch trip={trip} leg={leg} onPlaced={handleStayPlaced} />
        </div>
      ) : null}

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
