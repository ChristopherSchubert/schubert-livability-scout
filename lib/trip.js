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
    regions: r.regions || [], // geographic tags [{label,kind,lat,lon}] (#79)
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
    regions: t.regions ?? [],
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

// Per-line cash breakdown — same filter as cashNeeded but returns an array of
// { title, amount, currency } lines so BookView can render an itemized list.
// The total is cashNeeded(); this helper provides the lines, never a guessed
// title or amount — all from real entry data only.
export function cashNeededLines(trip) {
  const lines = [];
  for (const e of trip.entries || []) {
    const c = e.cost;
    if (c?.cashOnly && Number.isFinite(c.amount) && c.currency) {
      lines.push({ title: e.title || "", amount: c.amount, currency: c.currency });
    }
  }
  return lines;
}

// Bookings ledger — entries with a confirmation code or a cancellation
// deadline, soonest deadline first.
export function bookingsLedger(trip) {
  return (trip.entries || [])
    .filter((e) => e.booking?.confirmation || e.booking?.cancelBy)
    .sort((a, b) => (a.booking?.cancelBy || "9999").localeCompare(b.booking?.cancelBy || "9999"));
}

// Classify a single entry into the Needs-action vs Booked split.
// Needs action: has a future (or present) cancelBy but no confirmation, OR
//   status is "toBook" or "reserved" without a confirmation.
// Booked: has a real confirmation code.
// Unknown (excluded from both sections): neither.
export function bookingClass(entry) {
  const { booking, status } = entry;
  if (booking?.confirmation) return "booked";
  if (booking?.cancelBy) return "needsAction";
  if (status === "toBook" || status === "reserved") return "needsAction";
  return null;
}

// Hold-status phrase for a booked entry — derived strictly from real fields.
// Returns one of:
//   "prepaid 🔒"           — booking.prepaid is true, or markers include prepaid
//   "held to arrival"      — booking.heldToArrival is true
//   "free-cancel by <date>"— booking.cancelBy is set
//   "to book"              — no confirmation, no other signal
//   null                   — no phrase available (caller omits it)
export function holdPhrase(entry) {
  const { booking, markers = [] } = entry;
  const isPrepaid = booking?.prepaid || markers.some((m) => m.type === "prepaid");
  if (isPrepaid) return "prepaid 🔒";
  if (booking?.heldToArrival) return "held to arrival";
  if (booking?.cancelBy) return `free-cancel by ${booking.cancelBy}`;
  if (!booking?.confirmation) return "to book";
  return null;
}

// Split the full bookingsLedger into { needsAction, booked }.
// needsAction is sorted soonest cancelBy first; no-cancelBy needsAction rows
// go at the end of that list.
// Booked entries keep the order bookingsLedger() returns (soonest deadline first).
export function splitBookings(trip) {
  const needsAction = [];
  const booked = [];
  for (const e of bookingsLedger(trip)) {
    const cls = bookingClass(e);
    if (cls === "booked") booked.push(e);
    // bookingsLedger already filtered: anything here has confirmation OR cancelBy.
    // If bookingClass says needsAction treat it so; null won't appear (ledger
    // filter covers cancelBy or confirmation — but confirmation → "booked" above).
  }
  // Also pick up toBook/reserved entries NOT already in the ledger (no cancelBy,
  // no confirmation — they'd be filtered out by bookingsLedger but still need action).
  for (const e of trip.entries || []) {
    if (booked.some((b) => b.id === e.id)) continue;
    const cls = bookingClass(e);
    if (cls === "needsAction") needsAction.push(e);
  }
  // Sort needsAction: soonest cancelBy first, no-cancelBy rows at end.
  needsAction.sort((a, b) =>
    (a.booking?.cancelBy || "9999").localeCompare(b.booking?.cancelBy || "9999")
  );
  return { needsAction, booked };
}

// Is a Needs-action row urgent? True when the entry's cancelBy is within
// URGENT_DAYS of today (or already past), so rows close to the wire get
// highlighted. Also triggered if cancelBy is within URGENT_DAYS of the
// trip's start date (caller may pass today or the trip start, whichever
// is sooner, as the `referenceDate` YYYY-MM-DD string).
const URGENT_DAYS = 5;
export function isUrgent(entry, referenceDate) {
  const cancelBy = entry.booking?.cancelBy;
  if (!cancelBy) return false;
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  const diffMs = new Date(cancelBy).getTime() - new Date(ref).getTime();
  const diffDays = diffMs / 86400000;
  return diffDays <= URGENT_DAYS;
}

export function tripCityIds(trip) {
  return [...new Set((trip.legs || []).map((l) => l.cityId).filter(Boolean))];
}

// ── Diet-chip helpers ────────────────────────────────────────────────────────
// The diet chips from all travelers, de-duped, restricted to the two dietary
// flags we currently support. Used by MealScreen to decide whether to show
// screening badges on meal entries.
const DIET_CHIPS = new Set(["veg", "vegan"]);
// ── Lay-out dealer ───────────────────────────────────────────────────────────
// Soft per-day capacity ceiling — a presentational cue ("~X items feels full"),
// NOT an invented measurement. We don't know real durations; this is the max
// item count the column UI looks uncluttered at before items feel squeezed.
// Arrive/depart days get a tighter ceiling (travel eats time).
const DAY_CAP_NORMAL = 4;   // presentational: day column feels full above this
const DAY_CAP_EDGE   = 2;   // presentational: arrive/depart days — travel eats time

// layOutLegPlan — pure dealer: assigns bucket items to days without any I/O.
//
// Parameters
//   leg     — the leg object with .arrive and .depart YYYY-MM-DD strings
//   legDays — [ { date, cityId, legName } ] (from tripDays, pre-filtered to this leg)
//   bucket  — [ entry, … ] — undated items for this leg (legHint matches leg.cityId)
//   byDay   — { [date]: [ entry, … ] } — already-placed entries, keyed by day
//   pinnedIds (optional) — Set of entryId strings the user has manually pinned;
//               pinned entries in byDay are treated as locked (counted but unmovable)
//
// Returns { placements: [ { entryId, day } ], alternates: [ entryId ] }
//   placements — entries that fit; caller persists these (all at once, on keep)
//   alternates — entries that didn't fit (no day had room); remain undated
//
// Rules:
//   1. Each day has a soft ceiling (presentational cue — see constants above).
//   2. Days are filled by "emptiest first" (fewest existing items), so existing
//      pins spread the load automatically.
//   3. Arrive/depart days get a tighter ceiling so travel isn't crowded out.
//   4. Items that would push any day over its ceiling go to alternates.
//   5. Deterministic: stable sort order is preserved (items dealt in bucket order).
export function layOutLegPlan(leg, legDays, bucket, byDay, pinnedIds) {
  if (!leg || !legDays || !legDays.length || !bucket || !bucket.length) {
    return { placements: [], alternates: [] };
  }

  // Build mutable count map seeded from existing dated entries.
  const counts = {};
  for (const d of legDays) {
    counts[d.date] = (byDay[d.date] || []).length;
  }

  // Cap per day — edge days (arrive/depart) get the tighter ceiling.
  const capFor = (d) =>
    (d.date === leg.arrive || d.date === leg.depart) ? DAY_CAP_EDGE : DAY_CAP_NORMAL;

  const placements = [];
  const alternates = [];

  for (const item of bucket) {
    // Find the emptiest open day that still has room under its ceiling.
    let bestIdx = -1;
    let bestCount = Infinity;
    for (let i = 0; i < legDays.length; i++) {
      const d = legDays[i];
      const c = counts[d.date];
      const cap = capFor(d);
      if (c < cap && c < bestCount) {
        bestCount = c;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // No day with room — demote to alternates.
      alternates.push(item.id);
    } else {
      const day = legDays[bestIdx].date;
      counts[day] += 1;
      placements.push({ entryId: item.id, day });
    }
  }

  return { placements, alternates };
}

export function tripDietChips(trip) {
  const found = new Set();
  for (const t of trip?.travelers || []) {
    for (const c of t.chips || []) {
      if (DIET_CHIPS.has(c)) found.add(c);
    }
  }
  return [...found];
}

// Determines the veg screening state for a single entry given the active diet
// chips. Returns:
//   null        — dietChips is empty, OR entry is not a meal
//   'ok'        — entry.markers contains a {type:'veg'} marker (Google-cited)
//   'unverified'— meal entry but no veg marker
export function mealVegState(entry, dietChips) {
  if (!dietChips?.length) return null;
  if (entry?.category !== "meal") return null;
  const markers = entry?.markers || [];
  return markers.some((m) => m.type === "veg") ? "ok" : "unverified";
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
