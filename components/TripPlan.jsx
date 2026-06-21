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
//   and "Lay out →" computes a PROPOSAL without persisting it. The user reviews
//   the proposed placements (ghosted cards in day columns), keeps or undoes.
//   A "Didn't fit — alternates" row shows demoted items. Dragging a bucket
//   card onto a day column pins it and pauses auto-layout; the user can
//   re-lay-out around pins.
//
// This replaces the old always-expanded list where every leg's suggestion tray
// rendered at once — the wall the deck was designed to avoid.
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragOverlay,
} from "@dnd-kit/core";
import { useTrips } from "./TripProvider";
import { usePlanner } from "./PlannerProvider";
import { tripDays, entriesByDay, tripDietChips, layOutLegPlan } from "../lib/trip";
import { appendCityLeg, daysBetween, nearestCities } from "../lib/trip-window";
import { CAT_ICON, MealScreen } from "./atoms";
import GatherBucket from "./GatherBucket";
import TripWindow, { LEG_COLORS } from "./TripWindow";
import StaySearch from "./StaySearch";

const legKey = (leg) => leg?.cityId || leg?.name || "";
const DOW3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowDay = (ymd) => (ymd ? `${DOW3[new Date(ymd + "T00:00:00").getDay()]} ${+ymd.slice(8, 10)}` : "");
const spanLabel = (leg) => (leg?.arrive && leg?.depart ? `${dowDay(leg.arrive)} – ${dowDay(leg.depart)}` : "");
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

// Geographic Google-Places types. The cold-start name geocode (below) only
// adopts a center when the trip name resolves to a PLACE — a region, locality,
// admin area, or natural feature — never a business that happens to match the
// words. Keeps "Weekend getaway" from latching onto a random café, and honours
// the never-invent rule: an unrecognised name leaves the anchor null.
const GEO_PLACE_TYPES = new Set([
  "political", "locality", "sublocality", "neighborhood", "colloquial_area",
  "administrative_area_level_1", "administrative_area_level_2",
  "administrative_area_level_3", "natural_feature", "archipelago",
  "country", "postal_code",
]);
const isGeographicPlace = (p) =>
  !!p && p.lat != null && p.lon != null &&
  (p.types || []).some((t) => GEO_PLACE_TYPES.has(t));

export default function TripPlan({ trip, onEdit }) {
  const { addEntry, updateEntry, removeEntry, updateTripFrame } = useTrips();
  const { planner } = usePlanner();
  const [focus, setFocus] = useState(null); // legKey of the focused city, or null
  const [flightsOpen, setFlightsOpen] = useState(false);
  // legKey whose hotel search is currently open in the overview stay bar.
  const [staySearchLeg, setStaySearchLeg] = useState(null); // legKey
  // "＋ other city" search state
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherQuery, setOtherQuery] = useState("");
  const [otherResults, setOtherResults] = useState([]);
  const [otherBusy, setOtherBusy] = useState(false);
  const [otherErr, setOtherErr] = useState("");
  // Cold-start suggestion anchor: when the trip has no legs yet but its name
  // reads as a real place, the geocoded center grounds the tray. { lat, lon } | null.
  const [nameAnchor, setNameAnchor] = useState(null);

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

  // Cold-start grounding: with no legs yet, geocode the trip name once (debounced)
  // and adopt its center as the tray's anchor — so "Hudson River Valley" surfaces
  // nearby scouted places instead of an alphabetical slice. Only a name that
  // resolves to a geographic place counts; anything else leaves the anchor null
  // (never an invented center). Once a city is added, legs drive the ranking and
  // this stops firing.
  useEffect(() => {
    if (legs.length > 0) { setNameAnchor(null); return; }
    const name = (trip.name || "").trim();
    if (name.length < 3) { setNameAnchor(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/places/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: name, limit: 1 }),
        });
        const j = await r.json();
        const top = (j.results || [])[0];
        if (!cancelled) setNameAnchor(isGeographicPlace(top) ? { lat: top.lat, lon: top.lon } : null);
      } catch {
        if (!cancelled) setNameAnchor(null);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [trip.name, legs.length]);

  // The tray = scouted Atlas cities NEAR this trip, not the whole atlas. A trip
  // in Slovenia shouldn't surface 119 US cities — only places within reach of
  // its region (nearest-first, capped). Anchors = the trip's leg cities, or — at
  // cold start — the geocoded trip name. With no usable anchor, fall back to a
  // short alphabetical slice; ＋ other city covers the rest.
  const scoutCities = useMemo(() => {
    const all = (planner.cities || []).filter((c) => c.id && !legCityIds.has(c.id) && c.lat != null && c.lon != null);
    const legAnchors = legs
      .map((l) => (planner.cities || []).find((c) => c.id === l.cityId))
      .filter((c) => c && c.lat != null);
    const anchors = legAnchors.length ? legAnchors : (nameAnchor ? [nameAnchor] : []);
    if (!anchors.length) return all.slice(0, 12);
    return nearestCities(all, anchors, { maxKm: 400, limit: 12 });
  }, [planner.cities, legCityIds, legs, nameAnchor]);

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

  async function addOwn(leg) {
    const saved = await addEntry(trip.id, {
      day: null, role: "anchor", category: "activity", status: "none",
      title: "", time: { mode: "bucket", bucket: "flex" }, legHint: leg.cityId || null,
    });
    if (saved) onEdit(saved);
  }

  // No-nights-free tooltip (shown when all legs are at minimum span).
  const noNightsMsg = "no nights free — extend the trip first";

  // ── Proposal state — lifted here so FocusCity callbacks can reach updateEntry ──
  // proposal: { placements: [{entryId, day}], alternates: [entryId] } | null
  // If non-null, day columns show ghost cards for proposed placements.
  // pinnedIds: Set — entries the user has manually dragged to a specific day
  //             while the proposal is staged; these are fixed in re-layouts.
  const [proposal, setProposal] = useState(null);
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  // paused: true when the user has manually dragged a card (auto-layout paused)
  const [layoutPaused, setLayoutPaused] = useState(false);

  // Start a proposal (or re-compute around current pins).
  const startProposal = useCallback((leg) => {
    const ld = legDays(leg);
    if (!ld.length) return;
    const bucket = bucketFor(leg);
    if (!bucket.length) return;
    // When re-laying out around pins, entries that are already pinned (in byDay
    // via a prior keep, or manually dragged this session) are already counted in
    // byDay — layOutLegPlan's byDay seed includes them so they reduce room.
    const result = layOutLegPlan(leg, ld, bucket, byDay, pinnedIds);
    setProposal(result);
    setLayoutPaused(false);
  }, [days, byDay, pinnedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep: persist all proposed placements, then clear proposal state.
  const keepProposal = useCallback(async (leg) => {
    if (!proposal) return;
    const bucket = bucketFor(leg);
    const byId = Object.fromEntries(bucket.map((e) => [e.id, e]));
    for (const { entryId, day } of proposal.placements) {
      const entry = byId[entryId];
      if (entry) {
        // eslint-disable-next-line no-await-in-loop
        await updateEntry(trip.id, { ...entry, day });
      }
    }
    setProposal(null);
    setPinnedIds(new Set());
    setLayoutPaused(false);
  }, [proposal, trip.id, updateEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo: discard the proposal without writing anything.
  const undoProposal = useCallback(() => {
    setProposal(null);
    setPinnedIds(new Set());
    setLayoutPaused(false);
  }, []);

  // Manual drag: place a bucket card on a specific day → pin it, pause auto.
  // This is called by FocusCity after a successful drag-end.
  const handleManualDrop = useCallback(async (leg, entry, targetDay) => {
    // Persist immediately — manual placement is always direct.
    await updateEntry(trip.id, { ...entry, day: targetDay, pinned: true });
    setPinnedIds((prev) => new Set([...prev, entry.id]));
    // If a proposal is staged, flag as paused (user can re-lay out around pins).
    if (proposal) setLayoutPaused(true);
    else setProposal(null); // no proposal → stay clear
  }, [proposal, trip.id, updateEntry]);

  return (
    <div className="tw-plan">
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
          <button className="tw-collapsec" onClick={() => { setFocus(null); undoProposal(); }} aria-label="Back to all cities">
            ← <b>All cities</b> · Flights {flights.length} ✈ · Stays {stayCount} 🛏
          </button>
          <FocusCity
            leg={focused} days={legDays(focused)} byDay={byDay} stay={stayFor(focused)}
            bucket={bucketFor(focused)} trip={trip} onEdit={onEdit} onRemove={removeEntry}
            onLayOut={() => startProposal(focused)}
            onRelayout={() => startProposal(focused)}
            onKeep={() => keepProposal(focused)}
            onUndo={undoProposal}
            onManualDrop={(entry, day) => handleManualDrop(focused, entry, day)}
            proposal={proposal}
            layoutPaused={layoutPaused}
            onAddOwn={() => addOwn(focused)}
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

          {/* City cards — readable detail under the bar; click to plan. Each
              row sheds dates → nights → hotel as it narrows; city stays. */}
          <div className="tw-citycards" aria-label="Cities — click one to plan its days">
            {legs.map((leg, i) => {
              const stay = stayFor(leg);
              const lk = legKey(leg);
              const on = focus === lk;
              return (
                <div key={lk} className={`tw-citycard${on ? " on" : ""}`}>
                  <button className="tw-citycard-in"
                          onClick={() => { setFocus(lk); if (!stay) setStaySearchLeg(lk); }}
                          aria-label={stay ? `Plan ${cityName(leg)}` : `Plan ${cityName(leg)} and search hotels`}>
                    <span className="tw-citycard-dot" style={{ "--leg": LEG_COLORS[i % LEG_COLORS.length] }} aria-hidden="true" />
                    <span className="tw-citycard-name">{cityName(leg)}</span>
                    <span className="tw-citycard-meta tw-citycard-nights">· {nights(leg)}n</span>
                    <span className="tw-citycard-meta tw-citycard-dates">· {spanLabel(leg)}</span>
                    {stay
                      ? <span className="tw-citycard-hotel">🛏 <span>{stayName(stay.title)}</span></span>
                      : <span className="tw-citycard-hotel empty">🔍 <span>Search hotels</span></span>}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── DayDropZone — wraps a day column so bucket cards can be dragged onto it ──
function DayDropZone({ date, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  return (
    <div ref={setNodeRef} className={`tw-daycol${isOver ? " tw-daycol-over" : ""}`}>
      {children}
    </div>
  );
}

// ── DraggableBucketCard — a bucket card that can be dragged to a day column ──
function DraggableBucketCard({ entry, onEdit, onRemove, dietChips, isProposed, isAlternate }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bucket-${entry.id}`,
    data: { entryId: entry.id },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 200 }
    : undefined;

  const cls = [
    "tw-mini has-acts",
    `cat-${entry.category || "activity"}`,
    isProposed ? "tw-proposed" : "",
    isAlternate ? "tw-alternate" : "",
    isDragging ? "tw-dragging" : "",
  ].filter(Boolean).join(" ");

  return (
    <div ref={setNodeRef} style={style} className={cls} {...attributes}>
      {/* drag grip */}
      <span className="tw-grip" {...listeners} aria-label={`Drag ${entry.title || "item"} to a day`} tabIndex={0}>⠿</span>
      <span className="tw-iacts">
        <i role="button" tabIndex={0} title="edit" aria-label={`Edit ${entry.title || "item"}`}
           onClick={() => onEdit(entry)}
           onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEdit(entry); } }}>✎</i>
        <i role="button" tabIndex={0} title="remove" aria-label={`Remove ${entry.title || "item"}`}
           onClick={() => onRemove(entry.id)}
           onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onRemove(entry.id); } }}>✕</i>
      </span>
      <b>{CAT_ICON[entry.category] || "•"} {entry.title || "untitled"}</b>
      {entry.place?.name && entry.place.name !== entry.title ? <small>{entry.place.name}</small> : null}
      <MealScreen entry={entry} dietChips={dietChips} />
    </div>
  );
}

// The focused city: its header (with stay slot / StaySearch), day columns,
// and the one bucket — now with proposal/keep/undo and DnD drag-to-pin.
function FocusCity({ leg, days, byDay, stay, bucket, trip, onEdit, onRemove,
                     onLayOut, onRelayout, onKeep, onUndo, onManualDrop,
                     proposal, layoutPaused,
                     onAddOwn, dietChips,
                     staySearchOpen, onOpenStaySearch, onCloseStaySearch }) {
  const open = days.length;
  const hours = bucket.length * HOURS_PER_ITEM;
  const ready = bucket.length >= Math.max(2, open);

  // Build fast lookup maps from the proposal (if staged).
  // proposedByDay: { [date]: [entryId, …] }
  // alternateSet: Set<entryId>
  const proposedByDay = useMemo(() => {
    if (!proposal) return {};
    const map = {};
    for (const { entryId, day } of proposal.placements) {
      (map[day] ||= []).push(entryId);
    }
    return map;
  }, [proposal]);

  const alternateSet = useMemo(() =>
    new Set(proposal?.alternates || []),
  [proposal]);

  // The bucket entries that are not yet proposed or already placed:
  // in a staged proposal, the bucket cards show either as "proposed" (ghost in
  // their target column) or as "alternate" (in the Didn't fit row).
  const bucketById = useMemo(() =>
    Object.fromEntries(bucket.map((e) => [e.id, e])),
  [bucket]);

  // Sensor with a small distance threshold so taps don't accidentally drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeEntry, setActiveEntry] = useState(null);

  function handleDragStart({ active }) {
    const entryId = active.data.current?.entryId;
    const entry = bucket.find((e) => e.id === entryId);
    setActiveEntry(entry || null);
  }

  function handleDragEnd({ active, over }) {
    setActiveEntry(null);
    if (!over) return;
    const entryId = active.data.current?.entryId;
    const entry = bucket.find((e) => e.id === entryId);
    if (!entry) return;
    // over.id is "day-YYYY-MM-DD"
    const targetDay = over.id.replace(/^day-/, "");
    if (!targetDay || !days.some((d) => d.date === targetDay)) return;
    onManualDrop(entry, targetDay);
  }

  // When a stay is just placed via StaySearch, open it in EntryEditor for
  // booking details and close the search panel.
  function handleStayPlaced(saved) {
    onCloseStaySearch();
    onEdit(saved);
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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

      {/* Proposal keep/undo bar — shown when a proposal is staged */}
      {proposal && (
        <div className="tw-proposal-bar" role="region" aria-label="Layout proposal">
          <span className="tw-proposal-label">{cityName(leg)} · proposal</span>
          <button className="tw-proposal-keep" onClick={onKeep}>✓ keep this layout</button>
          <button className="tw-proposal-undo" onClick={onUndo}>↶ undo</button>
        </div>
      )}

      {/* Paused banner — shown after a manual drag while a proposal is staged */}
      {layoutPaused && (
        <div className="tw-layout-paused" role="status">
          <span>Auto-layout paused — manual edits</span>
          <button className="tw-relayout" onClick={onRelayout}>↻ re-lay out around my pins</button>
        </div>
      )}

      <div className="tw-daycols-wrap">
        <div className="tw-daycols">
          {days.map((d) => {
            const list = byDay[d.date] || [];
            const marker = d.date === leg.arrive ? "arrive" : d.date === leg.depart ? "depart" : "";
            const fill = Math.min(100, list.length * 28);
            // Ghost cards for proposed placements on this day
            const proposed = (proposedByDay[d.date] || []).map((eid) => bucketById[eid]).filter(Boolean);
            return (
              <DayDropZone key={d.date} date={d.date}>
                <div className="tw-dh"><span>{dow(d.date)} {d.date.slice(8)}</span>{marker ? <small>{marker}</small> : null}</div>
                {list.map((e) => (
                  <div key={e.id} className={`tw-mini cat-${e.category || "activity"}${e.pinned ? " tw-pinned-entry" : ""}`}
                       onClick={() => onEdit(e)}
                       role="button" tabIndex={0} aria-label={`Edit ${e.title || "entry"}`}
                       onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onEdit(e); } }}>
                    <b><span className="tw-mini-i" aria-hidden="true">{CAT_ICON[e.category] || "•"}</span><span className="tw-mini-t">{e.title || "untitled"}{e.pinned ? " 📌" : ""}</span></b>
                    <MealScreen entry={e} dietChips={dietChips} />
                  </div>
                ))}
                {/* Ghost proposed cards */}
                {proposed.map((e) => (
                  <div key={`proposed-${e.id}`} className={`tw-mini tw-proposed cat-${e.category || "activity"}`}
                       aria-label={`Proposed: ${e.title || "item"}`}>
                    <b><span className="tw-mini-i" aria-hidden="true">{CAT_ICON[e.category] || "•"}</span><span className="tw-mini-t">{e.title || "untitled"}</span></b>
                    <MealScreen entry={e} dietChips={dietChips} />
                  </div>
                ))}
                <div className="tw-cap"><i style={{ width: `${fill}%` }} /></div>
              </DayDropZone>
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
          {bucket.length && !proposal ? (
            <button className="tw-layout" onClick={onLayOut}>Lay out {cityName(leg)} →</button>
          ) : null}
        </div>

        {/* Alternates row — shown when proposal has overflowed items */}
        {proposal && alternateSet.size > 0 && (
          <div className="tw-alternates">
            <div className="tw-alternates-head">Didn't fit — alternates</div>
            <div className="tw-cardrow">
              {[...alternateSet].map((eid) => {
                const e = bucketById[eid];
                if (!e) return null;
                return (
                  <DraggableBucketCard
                    key={e.id} entry={e} onEdit={onEdit} onRemove={onRemove}
                    dietChips={dietChips} isAlternate
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Full bucket cards (draggable) — when no proposal, show all;
            when proposal staged, show only remaining (proposed are ghosted in columns) */}
        {bucket.length ? (
          <div className="tw-cardrow">
            {bucket
              .filter((e) => !proposal || (!proposedByDay || !Object.values(proposedByDay).some((ids) => ids.includes(e.id))))
              .filter((e) => !alternateSet.has(e.id))
              .map((e) => (
                <DraggableBucketCard
                  key={e.id} entry={e} onEdit={onEdit} onRemove={onRemove}
                  dietChips={dietChips}
                />
              ))}
          </div>
        ) : null}

        <div className="tw-toolrow">
          <GatherBucket trip={trip} leg={leg} />
          <button className="tw-add" onClick={onAddOwn}>＋ add your own</button>
          {!bucket.length ? <span className="tw-plan-hint">booked &amp; dated things skip the bucket — they place themselves</span> : null}
        </div>
      </div>

      {/* DragOverlay — floating clone while dragging */}
      <DragOverlay>
        {activeEntry ? (
          <div className={`tw-mini tw-drag-overlay cat-${activeEntry.category || "activity"}`}>
            <b>{CAT_ICON[activeEntry.category] || "•"} {activeEntry.title || "untitled"}</b>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
