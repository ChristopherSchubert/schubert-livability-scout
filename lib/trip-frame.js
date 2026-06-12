// Trip frame (#33) — the briefing layer that makes a trip read like a finished
// magazine spread: a glance fact grid, read-first limitations, a booking
// checklist, and a sources ledger. Every value here is DERIVED from real trip
// data or left blank — never fabricated (CLAUDE.md's one rule). A fact we don't
// have is `null`, rendered as "—", not guessed. Pure + isomorphic so it's unit
// tested (test/trip-frame.test.mjs); the asOf date is passed in (callers stamp
// it) so this stays deterministic.
import { cashNeeded, bookingsLedger, tripDays, MARKER_TYPES } from "./trip.js";

const cityShort = (name) => (name || "").split(",")[0].trim();

// The union of markers carried by any entry — the honest "this trip involves…"
// set (dog, vegetarian, kid, accessible…). Used by the glance + limitations.
export function markerUnion(trip) {
  const seen = new Map();
  for (const e of trip.entries || []) for (const m of e.markers || []) {
    if (m?.type && !seen.has(m.type)) seen.set(m.type, MARKER_TYPES[m.type] || { label: m.type, icon: "🔖" });
  }
  // Traveler chips are first-class markers of intent too (diet, pets).
  for (const t of trip.travelers || []) for (const c of t.chips || []) {
    const key = `chip:${c}`;
    if (!seen.has(key)) seen.set(key, { label: c, icon: "•" });
  }
  return [...seen.entries()].map(([type, meta]) => ({ type, ...meta }));
}

// Glance facts — the fact grid. Each row is { label, value|null, source }.
// value === null renders as a blank ("not yet known"), never a guess.
export function glanceFacts(trip) {
  const legs = trip.legs || [];
  const destination = legs.length ? legs.map((l) => cityShort(l.name)).filter(Boolean).join(" → ") : null;
  const nights = (() => {
    const d = tripDays(trip);
    return d.length ? d.length - 1 : null;
  })();
  // Lodging: stay entries with a real place, by leg.
  const stays = (trip.entries || []).filter((e) => e.category === "stay" && e.place?.name);
  const lodging = stays.length ? [...new Set(stays.map((s) => s.place.name))].join(" · ") : null;
  const checkIn = (() => {
    const withTime = stays.find((s) => s.time?.at || s.time?.start);
    return withTime ? (withTime.time.at || withTime.time.start) : null;
  })();
  // Diet / travelers — read straight off the roster (no inference).
  const people = (trip.travelers || []).filter((t) => t.kind !== "pet");
  const pets = (trip.travelers || []).filter((t) => t.kind === "pet");
  const diet = (() => {
    const chips = [...new Set(people.flatMap((t) => t.chips || []))];
    return chips.length ? chips.join(", ") : null;
  })();
  const travelers = people.length
    ? people.map((t) => t.name).join(", ") + (pets.length ? ` + ${pets.map((p) => p.name).join(", ")} 🐾` : "")
    : null;

  return [
    { label: "Destination", value: destination, source: "trip legs" },
    { label: "Dates", value: trip.startDate && trip.endDate ? `${trip.startDate} – ${trip.endDate}` : null, source: "trip window" },
    { label: "Nights", value: nights != null ? String(nights) : null, source: "trip window" },
    { label: "Lodging", value: lodging, source: "stay entries" },
    { label: "Check-in", value: checkIn, source: "stay entry" },
    { label: "Diet", value: diet, source: "travelers" },
    { label: "Travelers", value: travelers, source: "travelers" },
    { label: "Theme", value: trip.theme || null, source: "trip frame" },
    // Weather + drive-from-home aren't in trip data yet → honest blanks.
    { label: "Weather", value: trip.glance?.weather || null, source: "NOAA normals (not fetched)" },
    { label: "Drive from home", value: trip.glance?.driveFromHome || null, source: "not measured" },
  ];
}

// Limitations — read-first warnings, each derived + cited with an asOf date.
// Severity: "warn" (blocks a clean trip) | "note" (FYI). Only emitted when the
// underlying count is real and > 0, so an empty list means "nothing to flag".
export function tripLimitations(trip, asOf) {
  const out = [];
  const entries = trip.entries || [];
  const placeable = entries.filter((e) => e.category === "meal" || e.category === "activity");
  const unpinned = placeable.filter((e) => !e.place || e.place.lat == null);
  if (unpinned.length) {
    out.push({
      severity: "warn",
      text: `${unpinned.length} stop${unpinned.length > 1 ? "s aren’t" : " isn’t"} pinned to a place — they won’t appear on the map or in travel-aware Solve.`,
      source: "place resolver", asOf,
    });
  }
  const dated = entries.filter((e) => e.day);
  const unscheduled = dated.filter((e) => (e.time?.mode || "bucket") === "bucket" && (e.category === "meal" || e.category === "activity"));
  if (unscheduled.length) {
    out.push({
      severity: "note",
      text: `${unscheduled.length} dated entr${unscheduled.length > 1 ? "ies have" : "y has"} no clock time yet — run ⚡ Solve on the day to lay them out.`,
      source: "day solver", asOf,
    });
  }
  const toBook = entries.filter((e) => e.status === "toBook");
  if (toBook.length) {
    out.push({
      severity: "warn",
      text: `${toBook.length} thing${toBook.length > 1 ? "s" : ""} still to book — see the checklist below.`,
      source: "entry status", asOf,
    });
  }
  const cash = cashNeeded(trip);
  for (const [cur, amt] of Object.entries(cash)) {
    out.push({
      severity: "note",
      text: `Bring ${cur === "EUR" ? "€" : cur + " "}${amt} in cash — that many entries are marked cash-only.`,
      source: "entry costs", asOf,
    });
  }
  return out;
}

// Booking checklist — every to-book + already-booked thing, soonest deadline
// first, with the persisted state living on the entry (status booked = done).
// Each row carries what we know (booking phone/url/by) and nothing we don't.
export function bookingChecklist(trip) {
  const led = bookingsLedger(trip); // confirmation OR deadline
  const toBook = (trip.entries || []).filter((e) => e.status === "toBook" && !led.includes(e));
  const rows = [...toBook, ...led].map((e) => ({
    id: e.id,
    title: e.title,
    done: e.status === "booked" || !!e.booking?.confirmation,
    bookBy: e.booking?.cancelBy || null,
    phone: e.booking?.phone || null,
    url: e.booking?.url || null,
    confirmation: e.booking?.confirmation || null,
  }));
  return rows.sort((a, b) => Number(a.done) - Number(b.done) || (a.bookBy || "9999").localeCompare(b.bookBy || "9999"));
}

// Sources ledger — the distinct provenances actually used by this trip's data,
// each with the count of claims it backs. Reads what's present; invents nothing.
export function tripSources(trip) {
  const entries = trip.entries || [];
  const led = [];
  const resolved = entries.filter((e) => e.place?.placeId).length;
  if (resolved) led.push({ source: "Google Places cache (pois)", note: `${resolved} place${resolved > 1 ? "s" : ""} resolved to a place_id`, asOf: null });
  const costed = entries.filter((e) => e.cost?.amount != null).length;
  if (costed) led.push({ source: "Hand-entered costs", note: `${costed} entr${costed > 1 ? "ies" : "y"} carry a cost`, asOf: null });
  const booked = entries.filter((e) => e.booking?.confirmation || e.booking?.cancelBy).length;
  if (booked) led.push({ source: "Booking records", note: `${booked} confirmation${booked > 1 ? "s" : ""}/deadline${booked > 1 ? "s" : ""}`, asOf: null });
  if (trip.glance?.weather) led.push({ source: "NOAA normals", note: "weather glance", asOf: null });
  return led;
}
