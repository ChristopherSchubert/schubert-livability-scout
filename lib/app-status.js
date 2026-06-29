// lib/app-status.js — the family-hub app-status contract for Travel (#113).
//
// GET /api/status returns ONE rich status object per the hub's app-status
// contract (schubert-family#76 + ADR 0005). The hub's app tile shows a live
// headline + attention level pulled from each spoke. Pure + isomorphic: the
// route does the queries + auth, this shapes the object. Every value is DERIVED
// from real rows or honestly omitted — never hardcoded (CLAUDE.md's one rule).
//
// Shape (validated by the hub's conformance/check-status.mjs):
//   { app:"travel", level:"ok"|"attention"|"urgent", headline,
//     metrics:[{label, value, delta?, level?}],
//     breakdown:[{label, count(int), level?}], deep_link, updated_at }
//
// level (travel's call, per the ticket):
//   ok        — board has cities, no planned trip needs attention
//   attention — a planned trip/visit has an unbooked critical item (hotel/flight)
//   urgent    — a departure within URGENT_DAYS still has an open critical blocker
import { tripDisplayName, splitBookings } from "./trip.js";

const MS_PER_DAY = 86_400_000;
const URGENT_DAYS = 14;

function toYmd(d) {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
function daysFromTo(fromYmd, toYmd_) {
  if (!fromYmd || !toYmd_) return null;
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd_}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

// A multi-city trip "needs a hotel" when some leg has no confirmation-backed
// stay entry within its dates. Honest: entries ARE loaded by the route, so this
// is a real gap, not an inference from missing data.
function tripNeedsHotel(trip) {
  const legs = trip.legs || [];
  if (!legs.length) return false;
  const stays = (trip.entries || []).filter((e) => e.category === "stay" && e.booking?.confirmation);
  return legs.some((leg) => {
    const covered = stays.some((s) => {
      if (!s.day) return true; // a confirmed stay with no day → count it (don't over-flag)
      if (!leg.arrive || !leg.depart) return true;
      return s.day >= leg.arrive && s.day <= leg.depart;
    });
    return !covered;
  });
}

function assessTrip(trip, nowYmd) {
  const days = daysFromTo(nowYmd, trip.startDate || null);
  const { needsAction } = splitBookings(trip);
  const criticalGaps = [];
  if (tripNeedsHotel(trip)) criticalGaps.push("a hotel");
  if (needsAction.some((e) => e.category === "travel")) criticalGaps.push("flights");
  return {
    name: tripDisplayName(trip),
    days: days != null && days >= 0 ? days : null, // upcoming only
    criticalGaps,
    link: `/trips/${trip.id}`,
  };
}

// A single-city scheduled visit (`cities` row, status='Scheduled' + dates).
// Post-#112 the legacy "Scheduled" path is retired and the route's query is
// expected to return zero rows — Commit goes through trips now. Kept as a
// defensive read-path: if someone hand-edits a legacy row, the status still
// surfaces. The lodging/flight slots are the owner-facing fields on the city
// row; an empty one is a real, unentered gap.
function assessVisit(city, nowYmd) {
  const days = daysFromTo(nowYmd, city.arriveDate || null);
  const filled = (v) => typeof v === "string" && v.trim().length > 0;
  const criticalGaps = [];
  if (!filled(city.lodgingDetails)) criticalGaps.push("a hotel");
  if (!filled(city.flightDetails)) criticalGaps.push("flights");
  return {
    name: `${(city.name || "").split(",")[0].trim()} visit`,
    days: days != null && days >= 0 ? days : null,
    criticalGaps,
    // Deep link to the city detail (the per-city Plan tab was removed in #107).
    link: city.slug ? `/cities/${city.slug}` : "/board",
  };
}

function clip(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function abs(baseUrl, path) {
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function appStatus({ trips = [], visits = [], citiesCount = 0 } = {}, { now = new Date(), baseUrl = "" } = {}) {
  const nowYmd = toYmd(now) || toYmd(new Date());
  const items = [
    ...trips.map((t) => assessTrip(t, nowYmd)),
    ...visits.map((v) => assessVisit(v, nowYmd)),
  ];
  const plannedCount = trips.length + visits.length;
  const withCritical = items.filter((i) => i.criticalGaps.length > 0);
  const urgent = items
    .filter((i) => i.criticalGaps.length > 0 && i.days != null && i.days <= URGENT_DAYS)
    .sort((a, b) => a.days - b.days)[0] || null;

  let level = "ok";
  if (urgent) level = "urgent";
  else if (withCritical.length) level = "attention";

  let headline;
  let deep_link;
  if (urgent) {
    headline = `${urgent.name} departs in ${urgent.days} day${urgent.days === 1 ? "" : "s"} — needs ${urgent.criticalGaps[0]}`;
    deep_link = abs(baseUrl, urgent.link);
  } else if (withCritical.length) {
    const it = withCritical.slice().sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))[0];
    headline = `${it.name} needs ${it.criticalGaps[0]}`;
    deep_link = abs(baseUrl, it.link);
  } else {
    headline = `${citiesCount} cit${citiesCount === 1 ? "y" : "ies"} · ${plannedCount} trip${plannedCount === 1 ? "" : "s"} planned`;
    deep_link = abs(baseUrl, "/board");
  }

  const metrics = [
    { label: "Cities tracked", value: String(citiesCount) },
    { label: "Trips planned", value: String(plannedCount) },
  ];
  // breakdown = labeled counts (contract: { label, count:int, level? }).
  const countGap = (g) => items.filter((i) => i.criticalGaps.includes(g)).length;
  const urgentCount = items.filter((i) => i.criticalGaps.length > 0 && i.days != null && i.days <= URGENT_DAYS).length;
  const hotelCount = countGap("a hotel");
  const flightCount = countGap("flights");
  const breakdown = [];
  if (urgentCount) breakdown.push({ label: "Departing soon with open items", count: urgentCount, level: "urgent" });
  if (hotelCount) breakdown.push({ label: "Needs a hotel", count: hotelCount, level: "attention" });
  if (flightCount) breakdown.push({ label: "Needs flights", count: flightCount, level: "attention" });

  return {
    app: "travel",
    level,
    headline: clip(headline, 60),
    metrics,
    breakdown,
    deep_link,
    updated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
  };
}
