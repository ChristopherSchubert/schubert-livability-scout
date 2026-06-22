// Trip → family-hub feed-card mapping (#93, epic #84).
//
// GET /api/feed returns ~1 card per trip, matching feed-contract v1 (see
// ../schubert-family/src/lib/feed-contract.ts + conformance/check-feed.mjs):
//   { key, kind: status|countdown|deadline|summary, title, body?, metric?,
//     delta?, member_id?(uuid|null=household-wide), event_at?(ISO),
//     deep_link?(url), priority?(int), expires_at?(ISO) }
//
// SUMMARIES ONLY — never raw rows. A card carries a trip's name, a short stop
// summary, and its dates; never entries/travelers/legs arrays. Pure + isomorphic
// (no DB, no React): the route resolves the owner's member_id (identity #90) and
// the household scope, then hands trips here.
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

// Short, human stop summary — first token of each leg name, capped. Never the
// raw leg objects.
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
 * Map one trip to a contract-valid feed card.
 *   opts.now       reference date (YYYY-MM-DD or Date); default today
 *   opts.memberId  the trip owner's platform member uuid, or null=household-wide
 *   opts.baseUrl   app origin for the deep link (e.g. https://travel.schubertfamily.com)
 */
export function tripToFeedCard(trip, { now = new Date(), memberId = null, baseUrl = "" } = {}) {
  const nowYmd = toYmd(now);
  const start = trip.startDate || null;
  const end = trip.endDate || null;
  const { text: bodyText } = stopSummary(trip);

  // Phase off the dates (lexicographic compare works for YYYY-MM-DD).
  let kind, metric, eventAt, priority;
  if (start && start > nowYmd) {
    // Upcoming — count down to departure.
    const days = daysBetween(nowYmd, start);
    kind = "countdown";
    eventAt = ymdToISO(start);
    metric = days != null ? `in ${days} day${days === 1 ? "" : "s"}` : null;
    priority = days != null ? Math.max(1, 60 - days) : 1; // sooner = higher
  } else if (start && end && start <= nowYmd && nowYmd <= end) {
    // On the trip now.
    kind = "status";
    eventAt = ymdToISO(end);
    metric = "on the trip";
    priority = 80;
  } else if (end && end < nowYmd) {
    // Past — a quiet summary card.
    kind = "summary";
    eventAt = null;
    metric = null;
    priority = 1;
  } else {
    // No dates yet — a planning placeholder.
    const { count } = stopSummary(trip);
    kind = "status";
    eventAt = null;
    metric = count ? `${count} stop${count > 1 ? "s" : ""}` : null;
    priority = 2;
  }

  return {
    key: `travel:trip:${trip.id}`,
    kind,
    title: tripDisplayName(trip),
    body: bodyText,
    metric,
    member_id: memberId ?? null,
    event_at: eventAt,
    deep_link: baseUrl ? `${baseUrl}/trips/${trip.id}` : null,
    priority,
    expires_at: ymdToISO(end),
  };
}

/** Map a list of trips to a contract-valid feed response: { cards: [...] }. */
export function feedFromTrips(trips, opts = {}) {
  return { cards: (trips || []).map((t) => tripToFeedCard(t, opts)) };
}
