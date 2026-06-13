// Trip domain model — the multi-city trip planner's spine. A Trip groups
// cities + days + entries as one object (see supabase/migrations/0013_trips.sql
// and features/trip-planner-components.md). Mirrors the lib/city-row.js
// contract: the snake<->camel mapping + derived helpers live in exactly one
// place so components stay thin (CLAUDE.md: domain logic lives in lib).

// ── Locked taxonomies ───────────────────────────────────────────────────────
// Entry kinds — the six-color key (booked|flexible|travel|meal|checkin|todo).
export const ENTRY_KINDS = ["booked", "flexible", "travel", "meal", "checkin", "todo"];

// Roles — anchors are placed by hand (the big rocks); connectives are the
// logistics Solve weaves between them (travel, rest, meals, buffer, free time).
export const ENTRY_ROLES = ["anchor", "connective"];

// Markers — decoupled + extensible. Each is its own flag, any combination,
// never bundled, and each can carry a cited `source`. New types add here without
// a schema change (markers live in jsonb). Shape: { type, value?, source? }.
export const MARKER_TYPES = {
  dog:         { icon: "🐾", label: "Dog-friendly" },
  veg:         { icon: "🥦", label: "Vegetarian" },
  kid:         { icon: "🧒", label: "Kid-friendly" },
  patio:       { icon: "☂️", label: "Patio / outdoor" },
  accessible:  { icon: "♿", label: "Accessible" },
  cashOnly:    { icon: "💰", label: "Cash only" },
  prepaid:     { icon: "🔒", label: "Prepaid" },
  reservation: { icon: "📞", label: "Reservation" },
  free:        { icon: "🎟️", label: "Free" },
  seasonal:    { icon: "📅", label: "Seasonal" },
  closed:      { icon: "⛔", label: "Closed" },
};

// ── Row <-> object mapping ──────────────────────────────────────────────────
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
    // entries: the v1 blob (kept as a migration source). The v2 trip's entries
    // are hydrated from the trip_entries table by fetchTrip(), which overwrites
    // this — see lib/db.js. Defaulted here so a frame-only fetch is still valid.
    entries: r.entries || [],
    travelers: r.travelers || [], // [ { name, kind: person|pet, chips[] } ] (0017)
    passes: r.passes || [],       // [ { id, name, cost, covers? } ] (0017)
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

// Full trip frame → row, for insertTrip. Partial frame patches go through
// TRIP_COL in lib/db.js (the mapPatch discipline). Entry rows are written
// separately to trip_entries, NOT here.
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
    entries: t.entries ?? [],
    travelers: t.travelers ?? [],
    passes: t.passes ?? [],
  };
}

// ── Derived helpers ─────────────────────────────────────────────────────────
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
    out.push({ date, cityId: leg?.cityId ?? null, legName: leg?.name ?? null });
  }
  return out;
}

// Entries grouped by day (sorted by start time within a day). `time` is a
// HH:MM string or { start, end }; fuzzy entries (no clock time) sort last.
export function entriesByDay(trip) {
  const by = {};
  for (const e of trip.entries || []) (by[e.day] ||= []).push(e);
  const startMin = (e) => {
    const raw = typeof e.time === "string" ? e.time : e.time?.start || "";
    const m = /^(\d{2}):(\d{2})/.exec(raw);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 + 1;
  };
  for (const day of Object.keys(by)) by[day].sort((a, b) => startMin(a) - startMin(b));
  return by;
}

// Cash needed — sum of cash-only costs, grouped by currency. Never invented:
// only entries that carry a real cost with cashOnly true.
export function cashNeeded(trip) {
  const totals = {};
  for (const e of trip.entries || []) {
    const c = e.cost;
    if (c?.cashOnly && Number.isFinite(c.amount) && c.currency) {
      totals[c.currency] = (totals[c.currency] || 0) + c.amount;
    }
  }
  return totals;
}

// Bookings ledger — entries with a confirmation code or a cancellation
// deadline, soonest deadline first.
export function bookingsLedger(trip) {
  return (trip.entries || [])
    .filter((e) => e.booking?.confirmation || e.booking?.cancelBy)
    .sort((a, b) => (a.booking?.cancelBy || "9999").localeCompare(b.booking?.cancelBy || "9999"));
}

export function tripCityIds(trip) {
  return [...new Set((trip.legs || []).map((l) => l.cityId).filter(Boolean))];
}

// A human display title for a trip — its name, else a destination derived from
// the legs, else the dates. Keeps raw/test identifiers (e.g. "E2E 1781…") from
// showing as a trip title. (#77)
export function tripDisplayName(trip) {
  const name = (trip?.name || "").trim();
  if (name && !/^E2E \d+$/.test(name)) return name;
  const dest = (trip?.legs || []).map((l) => (l.name || "").split(",")[0].trim()).filter(Boolean).join(" → ");
  if (dest) return dest;
  if (trip?.startDate) return `Trip · ${trip.startDate}`;
  return "Untitled trip";
}
