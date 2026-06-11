// Trip domain model — the multi-city trip planner's spine. A Trip groups
// cities + days + entries as one object (see supabase/migrations/0013_trips.sql
// + 0016_trip_entries.sql + 0017_trip_travelers_passes.sql, and
// features/trip-planner-components.md). Mirrors the lib/city-row.js contract:
// the snake<->camel mapping + derived helpers live in exactly one place so
// components stay thin (CLAUDE.md: domain logic lives in lib).
//
// Pure + isomorphic by rule: no React, no DB imports. Entries are hydrated
// from the trip_entries table by lib/db.js (issue #11) and attached as
// trip.entries; this file never reads Supabase.

// ── Locked taxonomies (entry-atom v2, 2026-06-10) ───────────────────────────
// The old single `kind` enum mixed two orthogonal axes. v2 splits them:
//   category = WHAT the entry is — drives the display hue.
//   status   = the COMMITMENT ladder — drives the lock/badge treatment.
// (features/trip-planner-components.md §3.)
export const ENTRY_CATEGORIES = ["travel", "meal", "activity", "stay", "errand"];

// The commitment ladder, ordered by what breaking it costs:
//   none     — no booking applicable (walk-in, do it whenever)
//   toBook   — booking NEEDED but not yet made ("sells out 4–6 mo ahead")
//   reserved — a slot is held, no money moved; breaking it costs goodwill
//   booked   — money committed (ticketed/prepaid/penalty); breaking it costs money
export const ENTRY_STATUSES = ["none", "toBook", "reserved", "booked"];

// Roles — anchors are placed by hand (the big rocks); connectives are the
// logistics Solve weaves between them (travel, rest, meals, buffer, free time).
export const ENTRY_ROLES = ["anchor", "connective"];

// Time fidelity modes — an entry's time firms up none → bucket → range → point
// as planning progresses (§3.5). TimeChip renders all three.
export const TIME_MODES = ["bucket", "range", "point"];
export const TIME_BUCKETS = ["morning", "afternoon", "evening"];

// Markers — decoupled + extensible. Each is its own flag, any combination,
// never bundled, and each can carry a cited `source`. New types add here without
// a schema change (markers live in jsonb). Shape: { type, value?, source? }.
export const MARKER_TYPES = {
  dog: { icon: "🐾", label: "Dog-friendly" },
  veg: { icon: "🥦", label: "Vegetarian" },
  kid: { icon: "🧒", label: "Kid-friendly" },
  patio: { icon: "☂️", label: "Patio / outdoor" },
  accessible: { icon: "♿", label: "Accessible" },
  cashOnly: { icon: "💶", label: "Cash only" },
  prepaid: { icon: "🔒", label: "Prepaid" },
  reservation: { icon: "📞", label: "Reservation" },
  free: { icon: "🎟️", label: "Free" },
  seasonal: { icon: "📅", label: "Seasonal" },
  closed: { icon: "⛔", label: "Closed" },
};

// Attribute markers are traveler-derived (a pet row is *why* 🐾 lights up); the
// rest are entry-intrinsic facts (cash-only, prepaid, …) that render on their
// own merits regardless of who's travelling. markerUnion() works over these.
export const ATTRIBUTE_MARKERS = ["dog", "veg", "kid", "patio", "accessible"];

// v1 `kind` → v2 (category, status). The seeded Slovenia trip migrates by this
// mapping (the migration script, issue #14, applies per-entry overrides for the
// `booked` cases — a booked meal is meal/booked, a booked tour is activity/booked).
// Kept here because it is pure domain knowledge, not migration plumbing.
const KIND_TO_V2 = {
  booked: { category: "activity", status: "booked" },
  flexible: { category: "activity", status: "none" },
  travel: { category: "travel", status: "none" },
  meal: { category: "meal", status: "none" },
  checkin: { category: "stay", status: "none" },
  todo: { category: "errand", status: "toBook" },
};
export function kindToV2(kind) {
  return KIND_TO_V2[kind] || { category: "activity", status: "none" };
}

// ── Row <-> object mapping ──────────────────────────────────────────────────
// rowToTrip hydrates the trip FRAME. Entries live in their own table now
// (trip_entries); lib/db.js#fetchTrip attaches the hydrated array as
// trip.entries. r.entries (the deprecated v1 blob) is read only as a fallback
// so a not-yet-migrated trip still renders.
export function rowToTrip(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id || null,
    name: r.name || "",
    theme: r.theme || "",
    // PostgREST returns date columns as "YYYY-MM-DD" strings; the pg pooler
    // returns JS Date objects. Normalize to a YYYY-MM-DD string either way.
    startDate: asYmd(r.start_date),
    endDate: asYmd(r.end_date),
    glance: r.glance || {},
    preTrip: r.pre_trip || {},
    legs: r.legs || [],
    options: r.options || {},
    travelers: r.travelers || [],
    passes: r.passes || [],
    entries: r.entries || [], // fallback; normally replaced by trip_entries hydration
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

// tripToRow maps the trip FRAME for a partial update — it deliberately omits
// `entries` (those are written to trip_entries per-row, not the blob). Mirrors
// lib/city-row.js's `?? null` discipline.
export function tripToRow(t) {
  return {
    user_id: t.userId ?? null,
    name: t.name ?? "",
    theme: t.theme ?? null,
    start_date: t.startDate || null,
    end_date: t.endDate || null,
    glance: t.glance ?? {},
    pre_trip: t.preTrip ?? {},
    legs: t.legs ?? [],
    options: t.options ?? {},
    travelers: t.travelers ?? [],
    passes: t.passes ?? [],
  };
}

// A single trip_entries row <-> a hydrated entry. id/day/sort are columns; the
// rest of the v2 atom lives in payload jsonb. Used by lib/db.js (issue #11).
export function rowToEntry(r) {
  if (!r) return null;
  return { id: r.id, day: asYmd(r.day), sort: r.sort ?? 0, ...(r.payload || {}) };
}
export function entryToRow(tripId, e) {
  const { id, day, sort, ...payload } = e || {};
  return {
    ...(id ? { id } : {}),
    trip_id: tripId,
    day: day || null,
    sort: sort ?? 0,
    payload,
  };
}

// ── Time helpers ────────────────────────────────────────────────────────────
const DAY_MS = 86400000;
function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
// Coerce a date column (string from PostgREST, Date from the pg pooler) to YYYY-MM-DD.
function asYmd(v) {
  if (!v) return "";
  if (v instanceof Date) return ymd(v);
  return String(v).slice(0, 10);
}
function hhmmToMin(raw) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// The clock minute an entry starts, for ordering within a day. Handles the v2
// time shape ({ mode: point|range|bucket }) and tolerates a v1 leftover (a
// "HH:MM" string or { start }). Bucketed/untimed entries return null (they sort
// after timed ones, in their saved `sort` order).
export function entryStartMinutes(entry) {
  const t = entry?.time;
  if (!t) return null;
  if (typeof t === "string") return hhmmToMin(t);
  if (t.mode === "point") return hhmmToMin(t.at ?? t.start);
  if (t.mode === "range") return hhmmToMin(t.start);
  if (t.mode === "bucket") return null;
  // v1 fallback: { start, end }
  if (t.start) return hhmmToMin(t.start);
  return null;
}

// ── Derived helpers ─────────────────────────────────────────────────────────
// The day columns of the trip — derived from start/end (never restated by the
// entries). Each day carries the leg (city) that covers it, if any.
export function tripDays(trip) {
  const start = parseYmd(trip.startDate);
  const end = parseYmd(trip.endDate);
  if (!start || !end || end < start) return [];
  const legFor = (dateStr) =>
    (trip.legs || []).find((l) => l.arrive <= dateStr && dateStr <= l.depart) || null;
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const date = ymd(new Date(t));
    const leg = legFor(date);
    out.push({
      date,
      cityId: leg?.cityId ?? null,
      legName: leg?.name ?? null,
      tz: leg?.tz ?? trip.glance?.tz ?? null,
    });
  }
  return out;
}

// Entries grouped by day. Timed entries (point/range) sort by start minute;
// bucketed/untimed entries follow, ordered by their saved `sort` then bucket.
export function entriesByDay(trip) {
  const by = {};
  for (const e of trip.entries || []) (by[e.day] ||= []).push(e);
  const bucketOrder = (e) => {
    const b = e?.time?.mode === "bucket" ? e.time.bucket : null;
    const i = TIME_BUCKETS.indexOf(b);
    return i === -1 ? TIME_BUCKETS.length : i;
  };
  for (const day of Object.keys(by)) {
    by[day].sort((a, b) => {
      const am = entryStartMinutes(a);
      const bm = entryStartMinutes(b);
      if (am != null && bm != null) return am - bm;
      if (am != null) return -1; // timed before untimed
      if (bm != null) return 1;
      // both untimed: bucket order, then saved sort
      return bucketOrder(a) - bucketOrder(b) || (a.sort ?? 0) - (b.sort ?? 0);
    });
  }
  return by;
}

// The trip's active marker set — the union of every traveler's restriction
// chips (a pet row is why 🐾 lights up; no dog row → 🐾 hides). `showAll` is the
// escape hatch (the data is kept even when a marker is currently irrelevant).
// Returns attribute-marker keys; entry-intrinsic markers (cashOnly, prepaid, …)
// are not traveler-gated and always render on the entries that carry them.
export function markerUnion(trip, { showAll = false } = {}) {
  if (showAll) return [...ATTRIBUTE_MARKERS];
  const set = new Set();
  for (const tr of trip.travelers || []) {
    for (const chip of tr.chips || []) set.add(chip);
  }
  return [...set];
}

// Cash to carry — sum of costs paid ON SITE with a cash-only constraint, grouped
// by currency. The v2 fix: `payment === "onSite" && cashOnly` (a prepaid booking
// never needs wallet cash, even if the venue is cash-only). Never invented —
// only entries with a real finite amount + currency count.
export function cashNeeded(trip) {
  const totals = {};
  for (const e of trip.entries || []) {
    const c = e.cost;
    if (c?.payment === "onSite" && c?.cashOnly && Number.isFinite(c.amount) && c.currency) {
      totals[c.currency] = (totals[c.currency] || 0) + c.amount;
    }
  }
  return totals;
}

// Reservation ledger — the unified booking spine over lodging + activities.
// Includes any entry that holds a slot (status reserved|booked) OR carries a
// cancellation deadline. Lodging (category "stay") ranks highest; within a rank,
// soonest cancel-by first (entries with no deadline sort last). Supersedes the
// old bookingsLedger.
export function reservationLedger(trip) {
  const rows = (trip.entries || []).filter(
    (e) => e.status === "reserved" || e.status === "booked" || e.booking?.cancelBy
  );
  const deadline = (e) => e.booking?.cancelBy || e.booking?.bookBy || "9999-12-31";
  const isLodging = (e) => (e.category === "stay" ? 0 : 1);
  return rows.sort((a, b) => isLodging(a) - isLodging(b) || deadline(a).localeCompare(deadline(b)));
}

// Booking checklist — DERIVED: every entry still needing to be booked
// (status "toBook") with its lead time, soonest "book by" first. The pre-trip
// to-do list falls out of the data rather than being hand-maintained.
export function bookingChecklist(trip) {
  return (trip.entries || [])
    .filter((e) => e.status === "toBook")
    .map((e) => ({
      id: e.id,
      title: e.title || "",
      day: e.day || null,
      leadTime: e.booking?.leadTime ?? null,
      bookBy: e.booking?.bookBy ?? null,
      url: e.url ?? null,
      contact: e.contact ?? null,
    }))
    .sort((a, b) => (a.bookBy || "9999-12-31").localeCompare(b.bookBy || "9999-12-31"));
}

// Transport deep links — zero-API, auto-built from carrier + number so live
// status is one tap away without storing any claim we didn't verify (§3,
// transport sub-shape). FlightAware for flights; a Google "<carrier> <number>
// status" query for everything. Honest nulls when inputs are missing.
export function transportDeepLinks(transport) {
  const t = transport || {};
  const carrier = (t.carrier || "").trim();
  const number = String(t.number || "").trim();
  if (!carrier || !number) return { flightAware: null, googleStatus: null };
  const code = `${carrier}${number}`.replace(/\s+/g, "");
  const flightAware =
    t.mode === "flight" ? `https://flightaware.com/live/flight/${encodeURIComponent(code)}` : null;
  const googleStatus = `https://www.google.com/search?q=${encodeURIComponent(`${carrier} ${number} status`)}`;
  return { flightAware, googleStatus };
}

export function tripCityIds(trip) {
  return [...new Set((trip.legs || []).map((l) => l.cityId).filter(Boolean))];
}

// Leg-boundary days where the IANA timezone changes (issue #37 / the tz spike,
// features/trip-timezones.md). Returns [{ date, from, to }] so the UI can flag
// "clocks change" on the affected day. Times are stored wall-clock-local + tz
// (never UTC), so this is a pure scan over consecutive days' resolved zones.
// Single-zone trips (Slovenia) return [].
export function legTzChanges(trip) {
  const days = tripDays(trip);
  const out = [];
  for (let i = 1; i < days.length; i++) {
    const from = days[i - 1].tz;
    const to = days[i].tz;
    if (from && to && from !== to) out.push({ date: days[i].date, from, to });
  }
  return out;
}
