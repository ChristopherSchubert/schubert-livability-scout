import { NextResponse } from "next/server";
import { connect } from "../../../lib/measurers/_db.js";
import {
  axisRollup,
  weightedAxisScore,
  monthlyComfortScores,
  cityVisitWindow,
  metricTaxonomy,
  metricScore,
  metricScoreBands,
  MONTHS,
} from "../../../lib/planner-data.js";
import { chipsFor } from "../../../lib/chips.js";

// GET /api/mockup-data?slug=newport-ri
//
// Returns a single JSON envelope shaped exactly like public/_mockup-data.json,
// but generated fresh from Supabase on every request. This is the live
// data path the magazine mockup (public/city-detail-redesign.html) reads.
//
// Server-side only — uses the direct pg connection (lib/measurers/_db.js),
// so RLS is bypassed and no auth is required from the browser. That's
// appropriate: cities table holds non-PII shared candidate data, and
// nothing here is mutating.

const HOMEBASE_SLUG = "allison-park-pa";
const DEFAULT_SLUG = "newport-ri";

export const dynamic = "force-dynamic";

function rowToCity(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    stayZone: r.stay_zone || "",
    heartIntersection: r.heart_intersection || "",
    why: r.why || "",
    ifWins: r.if_wins || "",
    ifFails: r.if_fails || "",
    heroImage: r.hero_image || null,
    status: r.status,
    decision: r.decision,
    driveHrsFromPit: r.drive_hrs_from_pit || null,
    lat: r.lat,
    lon: r.lon,
    // composite is recomputed below via weightedAxisScore — not read from row
    measuredMetrics: r.measured_metrics || {},
    visitClimate: r.visit_climate || null,
    crowdSeason: r.crowd_season || null,
    seasonNotes: r.season_notes || null,
    stayZoneBoundary: r.stay_zone_boundary || null,
  };
}

function extreme(visitClimate, pickValue, cmp) {
  if (!Array.isArray(visitClimate)) return null;
  let bestIdx = -1, bestVal = null;
  for (let i = 0; i < visitClimate.length; i++) {
    const v = pickValue(visitClimate[i]);
    if (v == null) continue;
    if (bestVal == null || cmp(v, bestVal)) { bestVal = v; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  return { monthIdx: bestIdx, month: MONTHS[bestIdx], value: bestVal };
}

function extremesFor(city) {
  return {
    coldest: extreme(city.visitClimate, (m) => m?.lo, (a, b) => a < b),
    hottest: extreme(city.visitClimate, (m) => m?.hi, (a, b) => a > b),
    wettest: extreme(city.visitClimate, (m) => m?.precipIn, (a, b) => a > b),
    darkest: extreme(city.visitClimate, (m) => m?.daylightHr, (a, b) => a < b),
  };
}

function metricSnapshot(city, m) {
  const dp = city.measuredMetrics?.[m.key];
  const value = dp?.value ?? null;
  const score = metricScore(value, m.key);
  const band = metricScoreBands[m.key];
  return {
    key: m.key,
    label: m.label,
    tagline: m.tagline || null,
    unit: m.unit,
    value,
    score: score != null ? Math.round(score * 10) / 10 : null,
    barPct: score != null ? Math.round(score * 10) : null,
    direction: m.dir,
    asOf: dp?.asOf ?? null,
    source: dp?.source || m.source,
    band: band ? { zeroAt: band[0], fullAt: band[1] } : null,
  };
}

function axesSnapshot(city) {
  const rollup = axisRollup(city);
  return metricTaxonomy.map((group) => ({
    axis: group.axis,
    label: group.label,
    score: rollup[group.axis],
    metrics: group.metrics.map((m) => metricSnapshot(city, m)),
  }));
}

export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || DEFAULT_SLUG;

  let client;
  try {
    client = await connect();
    const { rows } = await client.query(
      `select * from cities where slug = any($1::text[])`,
      [[slug, HOMEBASE_SLUG]]
    );
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    if (!bySlug[slug]) {
      return NextResponse.json({ error: `No city with slug "${slug}"` }, { status: 404 });
    }
    const city = rowToCity(bySlug[slug]);
    const homebase = bySlug[HOMEBASE_SLUG] ? rowToCity(bySlug[HOMEBASE_SLUG]) : null;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      city: {
        ...city,
        measuredScore: weightedAxisScore(city, { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 }),
        monthlyComfort: monthlyComfortScores(city),
        visitWindow: cityVisitWindow(city),
        extremes: extremesFor(city),
        chips: chipsFor(city),
        axes: axesSnapshot(city),
      },
      homebase: homebase ? {
        name: homebase.name,
        slug: homebase.slug,
        visitClimate: homebase.visitClimate,
        extremes: extremesFor(homebase),
      } : null,
    }, {
      // CORS — the static-server preview at :8765 fetches this from a
      // different origin during design iteration. The route is read-only
      // and exposes only non-PII shared candidate data, so wide-open is
      // fine. Cache-Control keeps every request fresh.
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}
