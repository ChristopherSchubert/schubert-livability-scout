// Trip + city-visit → family-hub feed-card mapping (#93, epic #84).
//
// GET /api/feed returns ~1 card per upcoming/active trip or single-city visit,
// matching feed-contract v1 (see ../schubert-family/src/lib/feed-contract.ts +
// conformance/check-feed.mjs):
//   { key, kind: status|countdown|deadline|summary, title, body?, metric?,
//     delta?, member_id?(uuid|null=household-wide), event_at?(ISO),
//     deep_link?(url), priority?(int), expires_at?(ISO) }
//
// TWO TRIP SOURCES — Travel stores trips in two places:
//   1. `travel.trips` — the multi-city Trip Planner (e.g. Slovenia: Ljubljana
//      → Bled → Piran). Mapped via tripToFeedCard.
//   2. `travel.cities` rows with `status='Scheduled'` + `arrive_date` set —
//      the single-city visit plan (e.g. Newport, RI · Aug 5–8). Mapped via
//      cityVisitToFeedCard.
//
// SUMMARIES ONLY — never raw rows. A card carries a name, a short context
// summary, and its dates; never entries/travelers/legs/blocks arrays. Pure +
// isomorphic (no DB, no React): the route does the queries + identity, then
// hands shaped objects here.
import { tripDisplayName } from "./trip.js";

const MS_PER_DAY = 86_400_000;

// YYYY-MM-DD → unambiguous ISO datetime (midnight UTC). Null-safe.
function ymdToISO(ymd) {
  return ymd ? `${ymd}T00:00:00Z` : null;
}

// Whole days from `fromYmd` to `toYmd` (both YYYY-MM-DD). Positive = future.
function daysBetween(fromYmd, toYmd) {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

function toYmd(d) {
  if (typeof d === "string") return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

// Shared phase-by-date: upcoming → countdown; ongoing → status;
// undated → status placeholder. PAST trips return null — the family hub is
// for what's happening / coming up, not a history feed. Past visits live in
// the app's own Visited/Assessed pages; the hub doesn't surface them.
function phaseByDate(start, end, nowYmd, { undatedMetric = null, undatedPriority = 2 } = {}) {
  if (start && start > nowYmd) {
    const days = daysBetween(nowYmd, start);
    return {
      kind: "countdown",
      eventAt: ymdToISO(start),
      metric: days != null ? `in ${days} day${days === 1 ? "" : "s"}` : null,
      priority: days != null ? Math.max(1, 60 - days) : 1, // sooner = higher
    };
  }
  if (start && end && start <= nowYmd && nowYmd <= end) {
    return { kind: "status", eventAt: ymdToISO(end), metric: "on the trip", priority: 80 };
  }
  if (end && end < nowYmd) {
    return null; // past — drop, don't render in the feed
  }
  return { kind: "status", eventAt: null, metric: undatedMetric, priority: undatedPriority };
}

// Short, human stop summary for a multi-city trip — first token of each leg
// name, capped. Never the raw leg objects.
function stopSummary(trip) {
  const names = (trip.legs || [])
    .map((l) => (l.name || "").split(",")[0].trim())
    .filter(Boolean);
  if (!names.length) return { count: 0, text: null };
  const shown = names.slice(0, 4).join(" → ");
  const text = `${names.length} stop${names.length > 1 ? "s" : ""}: ${shown}${names.length > 4 ? " …" : ""}`;
  return { count: names.length, text };
}

/**
 * Map one multi-city trip to a contract-valid feed card.
 *   opts.now       reference date (YYYY-MM-DD or Date); default today
 *   opts.memberId  the trip owner's platform member uuid, or null=household-wide
 *   opts.baseUrl   app origin for the deep link
 */
export function tripToFeedCard(trip, { now = new Date(), memberId = null, baseUrl = "" } = {}) {
  const nowYmd = toYmd(now);
  const start = trip.startDate || null;
  const end = trip.endDate || null;
  const { text: bodyText, count } = stopSummary(trip);
  const phase = phaseByDate(start, end, nowYmd, {
    undatedMetric: count ? `${count} stop${count > 1 ? "s" : ""}` : null,
    undatedPriority: 2,
  });
  if (!phase) return null; // past — drop
  return {
    key: `travel:trip:${trip.id}`,
    kind: phase.kind,
    title: tripDisplayName(trip),
    body: bodyText,
    metric: phase.metric,
    member_id: memberId ?? null,
    event_at: phase.eventAt,
    deep_link: baseUrl ? `${baseUrl}/trips/${trip.id}` : null,
    priority: phase.priority,
    expires_at: ymdToISO(end),
  };
}

/**
 * Map one single-city scheduled visit (a `travel.cities` row with
 * `status='Scheduled'` + arrive/depart dates) to a feed card. Distinct from
 * tripToFeedCard so the hub can tell them apart by key prefix
 * (`travel:visit:` vs `travel:trip:`) without inferring from data.
 *   city.id, city.name, city.slug, city.stayZone, city.heartIntersection,
 *   city.arriveDate, city.departDate — same shape rowToCity produces.
 */
// Count the unfilled trip-detail slots on a city row. These are the three
// owner-facing planning fields exposed in the Visit Plan UI; an empty/whitespace
// value means it hasn't been entered yet. Returns a small object the card
// builder uses to decide whether to surface a "to plan" hint.
function planGapCount(city) {
  const filled = (v) => typeof v === "string" && v.trim().length > 0;
  const slots = [city.flightDetails, city.lodgingDetails, city.carDetails];
  const empty = slots.filter((v) => !filled(v)).length;
  return { empty, total: slots.length };
}

export function cityVisitToFeedCard(city, { now = new Date(), memberId = null, baseUrl = "" } = {}) {
  const nowYmd = toYmd(now);
  const start = city.arriveDate || null;
  const end = city.departDate || null;
  // Body summarises the location *within* the city: the heart intersection if
  // it reads as a place ("Thames St & Bowen's Wharf"), else the stay zone
  // ("Historic Hill / Thames Street"), else nothing. Never raw block lists.
  const body = (city.heartIntersection || city.stayZone || "").trim() || null;
  const phase = phaseByDate(start, end, nowYmd, { undatedMetric: "planned visit", undatedPriority: 3 });
  if (!phase) return null; // past — drop
  // Surface unfilled trip-detail slots (flights / lodging / car) as a quiet
  // nudge on the countdown metric. Owner asked: "is it flagging that we don't
  // have stay or flight info entered?" — yes, now it is. Same contract — the
  // metric is still a single string. Voice: "in 38 days · 3 to plan" (gaps)
  // vs "in 38 days · ready" (all filled). Only on countdown cards; an ongoing
  // trip's metric stays "on the trip" — too late to plan, the family hub
  // doesn't need to nag mid-trip.
  let metric = phase.metric;
  if (phase.kind === "countdown") {
    const { empty, total } = planGapCount(city);
    if (metric) metric = `${metric} · ${empty === 0 ? "ready" : `${empty} to plan`}`;
    else metric = empty === 0 ? "ready" : `${empty}/${total} to plan`;
  }
  return {
    key: `travel:visit:${city.id}`,
    kind: phase.kind,
    title: city.name,
    body,
    metric,
    member_id: memberId ?? null,
    event_at: phase.eventAt,
    deep_link: baseUrl && city.slug ? `${baseUrl}/cities/${city.slug}` : null,
    priority: phase.priority,
    expires_at: ymdToISO(end),
  };
}

/**
 * Map both sources to a unified, contract-valid feed response: { cards }.
 * Trips first, then single-city visits — the hub sorts by priority anyway,
 * but stable order helps when cards tie.
 */
export function feedFromTripsAndVisits(trips, visits, opts = {}) {
  const cards = [
    ...(trips || []).map((t) => tripToFeedCard(t, opts)),
    ...(visits || []).map((v) => cityVisitToFeedCard(v, opts)),
  ].filter(Boolean); // drop nulls from past trips/visits
  return { cards };
}

/** Trips-only convenience (kept for older call sites + tests). */
export function feedFromTrips(trips, opts = {}) {
  return { cards: (trips || []).map((t) => tripToFeedCard(t, opts)).filter(Boolean) };
}
