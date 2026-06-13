import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { measurementAllowed } from "../../../lib/measurement-guard";
import {
  measureAround, findVisitCenters, nearestWaterMulti,
  rankedWaterBodies, distanceToTarget, nearestWater, geocodeHeart,
  measureCensus, measureWalkScore, measureClimate, measureSkyline,
  measureHorizonPeaks, composite, fetchStayZoneBoundary,
  syntheticWalkScore,
} from "../../../lib/measure";

// A few external calls; allow up to the plan ceiling.
export const maxDuration = 60;

/**
 * POST /api/measure
 * body: { cityId, lat?, lon?, recenter?, full?, refreshBoundary? }
 *  - lat/lon            → measure around that exact point (user moved the pin)
 *  - recenter:true      → recenter on the densest walkable cluster, then measure
 *  - refreshBoundary    → re-fetch the stay-zone polygon from sources
 *                         (Census Place → OSM → Tract → NRHP → fallback) before
 *                         measuring. Use after stay_zone changes.
 *  - full:true          → also refresh keyed/slow layers (Census, Walk Score,
 *                         climate, building coverage). Default is the fast
 *                         location-core (OSM + elevation + water, no keys).
 *
 * Measurement always uses the stay-zone boundary: the 700 m field is placed
 * at the densest social-POI cluster INSIDE the polygon (via findVisitCenters),
 * not blindly around the saved pin. Boundary is auto-fetched if missing.
 * Always MERGES into measured_metrics so other layers aren't clobbered.
 */

// Helper: ensure the city has a current stay-zone boundary. Lazily fetch and
// persist if missing or if `refresh` is set. Returns {poly, source, fetched}
// where `fetched` indicates we hit network this call.
async function ensureBoundary(supabase, city, anchor, { refresh } = {}) {
  if (city.stay_zone_boundary && !refresh) {
    return { poly: city.stay_zone_boundary, source: city.boundary_source || null, fetched: false };
  }
  const res = await fetchStayZoneBoundary(city.stay_zone, city.name, anchor);
  if (!res) return { poly: null, source: null, fetched: false };
  const asOf = new Date().toISOString().slice(0, 10);
  await supabase.from("cities").update({
    stay_zone_boundary: res.poly,
    boundary_source: res.source,
    boundary_set_at: asOf,
  }).eq("id", city.id);
  return { poly: res.poly, source: res.source, fetched: true };
}

export async function POST(request) {
  try {
    // Measurement is LOCAL-ONLY (CLAUDE.md: "Production never measures").
    // The OSM layers already fail closed on Vercel (Overpass → localhost →
    // ECONNREFUSED), but Census / Walk Score / climate / skyline fetch the
    // public internet with real keys, so an unguarded prod POST could burn the
    // metered budget AND merge partial, mixed-source metrics over the real
    // measured values. Hard-disable in production (mirrors /api/dev-login).
    if (!measurementAllowed()) {
      return NextResponse.json({ error: "Measurement is disabled in production (local-only)." }, { status: 404 });
    }
    const { cityId, lat, lon, full, scout, water, setWaterTarget, refreshBoundary } = await request.json();
    // (legacy `recenter` flag is intentionally ignored — measureAround now
    //  always picks the best 700 m inside the boundary, making it redundant.)
    if (!cityId) throw new Error("Missing cityId.");
    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    });

    const { data: city, error: readErr } = await supabase.from("cities")
      .select("id,name,stay_zone,stay_zone_boundary,boundary_source,boundary_set_at,heart_intersection,lat,lon,measured_metrics,measured_at,water_target").eq("id", cityId).single();
    if (readErr) throw new Error(readErr.message);

    // Scout mode: return candidate cores (with water distance each) so the user
    // can choose which one to base a visit around. No measuring of metrics, but
    // we DO lazily fetch and persist the stay-zone polygon on first scout so
    // candidates can be clipped to the neighborhood the user picked.
    if (scout) {
      let anchor = (city.lat != null && city.lon != null) ? { lat: city.lat, lon: city.lon } : null;
      if (!anchor) anchor = await geocodeHeart(city.heart_intersection, city.name);
      if (!anchor) throw new Error("Could not locate this city — set a point manually.");
      const b = await ensureBoundary(supabase, city, anchor, { refresh: refreshBoundary });
      const cands = await findVisitCenters(anchor.lat, anchor.lon, { boundary: b.poly });
      // ONE water fetch around the anchor, then distance per candidate locally.
      const waters = await nearestWaterMulti(anchor.lat, anchor.lon, cands);
      const candidates = cands.map((c, i) => ({ ...c, water_dist_m: waters[i] }));
      return NextResponse.json({
        ok: true, scout: true,
        current: { lat: city.lat, lon: city.lon },
        candidates,
        boundary: b.poly,
        boundaryFetched: b.fetched,
        boundarySource: b.source,
      });
    }

    // Water mode: list nearby major water bodies around the current center so
    // the user can choose which one "distance to water" targets. No DB write.
    if (water) {
      if (city.lat == null) throw new Error("Set a visit center first.");
      const bodies = await rankedWaterBodies(city.lat, city.lon);
      return NextResponse.json({ ok: true, water: true, current: city.water_target || null, bodies });
    }

    const asOf = new Date().toISOString().slice(0, 10);

    // Set/clear the water target: recompute only the water metric to the chosen
    // body (or auto-nearest when cleared), persist, and return — no full re-run.
    if (setWaterTarget !== undefined) {
      if (city.lat == null) throw new Error("Set a visit center first.");
      const target = setWaterTarget || null;
      const { dist, point, extentKm2 } = target
        ? await distanceToTarget(city.lat, city.lon, target)
        : await nearestWater(city.lat, city.lon);
      const merged = { ...(city.measured_metrics || {}) };
      merged.water_dist_m = { value: dist, asOf, source: target ? `OpenStreetMap — target: ${target.name}` : "OpenStreetMap (Overpass)", point: point || null };
      if (extentKm2 != null) merged.water_extent_km2 = { value: extentKm2, asOf, source: "OpenStreetMap (Overpass)" };
      const raw = {}; for (const [k, v] of Object.entries(merged)) raw[k] = v?.value;
      // Composite is computed for the response toast only — not persisted.
      // The live runtime recomputes via weightedAxisScore at render time, so
      // a stored scalar would just go stale.
      const measured = composite(raw);
      const { error: wErr } = await supabase.from("cities")
        .update({ measured_metrics: merged, water_target: target }).eq("id", cityId);
      if (wErr) throw new Error(wErr.message);
      return NextResponse.json({ ok: true, waterTarget: target, water_dist_m: dist, measured, measuredMetrics: merged });
    }
    // Where to anchor the boundary fetch + cluster scan. The saved pin (if
    // present) or, for a new city, the geocoded heart intersection.
    let anchor;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      anchor = { lat, lon };
    } else if (city.lat != null && city.lon != null) {
      anchor = { lat: city.lat, lon: city.lon };
    } else {
      anchor = await geocodeHeart(city.heart_intersection, city.name);
      if (!anchor) throw new Error("Could not locate this city — set a point manually.");
    }

    // Ensure the stay-zone boundary is current. If the user supplied a new
    // pin (lat/lon) or asked for refreshBoundary, we re-fetch from sources so
    // the measurement that follows runs against an up-to-date polygon.
    const userMovedPin = Number.isFinite(lat) && Number.isFinite(lon);
    const b = await ensureBoundary(supabase, city, anchor, { refresh: refreshBoundary || userMovedPin });

    // Measurement center: by default, the best-cluster center INSIDE the
    // boundary (measureAround handles this internally when given a boundary).
    const center = anchor; // the "anchor" of the search; measureAround returns the chosen cluster.

    // A moved pin is a new place — re-measure EVERY layer for the new point.
    // `full:false` can opt down to the no-key core, but default is everything,
    // and all layers run concurrently so wall-clock ≈ the slowest single call.
    const doFull = full !== false;
    const censusKey = process.env.CENSUS_API_KEY;
    const wsKey = process.env.WALKSCORE_API_KEY;
    const core = await measureAround(center.lat, center.lon, { asOf, boundary: b.poly });
    const measureLat = core.center.lat, measureLon = core.center.lon;
    // bldg_coverage now comes from measureAround (land-clipped via the disk's
    // water mask), so there's no separate measureBuildingCoverage call here —
    // a second un-clipped call would clobber the clipped value in the merge.
    const [cen, ws, cl, sky, horizon] = await Promise.all([
      doFull && censusKey ? measureCensus(measureLat, measureLon, censusKey, { asOf }) : Promise.resolve({ metrics: {} }),
      doFull && wsKey ? measureWalkScore(measureLat, measureLon, city.name, wsKey, { asOf }) : Promise.resolve({}),
      doFull ? measureClimate(measureLat, measureLon, { asOf }) : Promise.resolve({ metrics: {} }),
      doFull ? measureSkyline(measureLat, measureLon, { asOf }) : Promise.resolve({ metrics: {} }),
      doFull ? measureHorizonPeaks(measureLat, measureLon, { asOf }).catch(() => null) : Promise.resolve(null),
    ]);
    // Out of Walk Score coverage (or its API returned nothing usable) → compute
    // the synthetic OSM proxy from the core metrics measureAround just produced,
    // so non-US cities (Piran et al.) get a real walkability number instead of
    // the API's out-of-coverage noise. See lib/measure.js syntheticWalkScore.
    if (doFull && (ws.outOfCoverage || !ws.walk_score)) {
      const m = core.metrics || {};
      const v = (k) => m?.[k]?.value ?? null;
      const value = syntheticWalkScore({
        cafe_n: v("cafe_n"), bar_n: v("bar_n"), rest_n: v("rest_n"),
        daily_needs_n: v("daily_needs_n"), intersection_den: v("intersection_den"),
        mean_block_m: v("mean_block_m"), carfree_frac: v("carfree_frac"),
      });
      if (v("intersection_den") != null || v("cafe_n") != null) {
        ws.walk_score = {
          value, asOf,
          source: "synthetic OSM proxy (Walk Score-style)",
          sourceUrl: "https://www.openstreetmap.org",
          meta: { synthetic: true, reason: ws.outOfCoverage ? "outside Walk Score coverage (US/CA/AU/NZ)" : "Walk Score API returned no usable value" },
        };
      }
    }
    const geoSource = b.poly
      ? `best 700 m inside stay zone (${core.clusterN ?? "?"} POIs, ${core.drift ?? 0} m from pin)`
      : (userMovedPin ? "manual (placed by user)" : (city.lat != null ? undefined : "Nominatim (heart intersection)"));
    // Spread ws.walk_score only — `ws` may also carry an `outOfCoverage` flag
    // that must not leak into measured_metrics. bldg_coverage is already in
    // core.metrics (land-clipped), so there's no separate `bc` to merge.
    const wsMetric = ws.walk_score ? { walk_score: ws.walk_score } : {};
    const newMetrics = { ...core.metrics, ...cen.metrics, ...wsMetric, ...cl.metrics, ...sky.metrics };
    if (horizon) {
      newMetrics.mtn_horizon_pct = { value: horizon.occupancyPct, asOf, source: "Open-Meteo elevation + OSM peaks" };
      // Upgrade skyline_deg if the best named peak beats the ray-sampled value
      // (see lib/measurers/horizon.js — same logic, mirrored for this path
      // where sky + horizon run in parallel rather than in measurer order).
      const raySkyline = newMetrics.skyline_deg?.value ?? 0;
      if (horizon.bestVisibleAngle > raySkyline) {
        newMetrics.skyline_deg = {
          value: horizon.bestVisibleAngle,
          asOf,
          source: "Open-Meteo elevation + OSM peaks (best visible summit, occlusion-tested)",
        };
      }
    }

    // If a water target is set, re-route water distance to THAT body rather
    // than auto-nearest, so the user's choice persists across re-measures.
    // Measured from the actual measurement center, not the saved pin.
    if (city.water_target && newMetrics.water_dist_m) {
      const td = await distanceToTarget(measureLat, measureLon, city.water_target);
      if (td.dist != null) {
        newMetrics.water_dist_m = {
          value: td.dist, asOf,
          source: `OpenStreetMap — target: ${city.water_target.name}`,
          point: td.point,
          ...(city.water_target.kind ? { kind: city.water_target.kind } : {}),
        };
        if (td.extentKm2 != null) newMetrics.water_extent_km2 = { value: td.extentKm2, asOf, source: "OpenStreetMap (Overpass)" };
      }
    }

    // Merge over existing so untouched layers survive; recompute composite.
    const merged = { ...(city.measured_metrics || {}), ...newMetrics };
    const raw = {};
    for (const [k, v] of Object.entries(merged)) raw[k] = v?.value;

    // The saved pin (lat/lon) is where the user said "this is the place." We
    // only move it when the request explicitly carries a new lat/lon (manual
    // drag) OR when there was no prior pin. Routine re-measures don't move
    // it — the adaptive measurement center is recorded in geo_source for
    // transparency, not by overwriting the user's choice.
    const movePin = userMovedPin || city.lat == null;
    const newLat = movePin ? center.lat : city.lat;
    const newLon = movePin ? center.lon : city.lon;

    const patch = {
      measured_metrics: merged,
      measured_at: asOf,
      lat: newLat, lon: newLon, geocoded_at: asOf,
    };
    if (geoSource) patch.geo_source = geoSource;
    if (horizon) patch.horizon_features = horizon; // visible named peaks + occupancy
    if (cl.visitClimate) patch.visit_climate = cl.visitClimate; // 12-month normals

    const { error: writeErr } = await supabase.from("cities").update(patch).eq("id", cityId);
    if (writeErr) throw new Error(writeErr.message);

    // Composite computed for the response toast only — not persisted.
    // The runtime recomputes via weightedAxisScore on every render, so any
    // stored scalar would just lag behind the truth.
    const measured = composite(raw);

    return NextResponse.json({
      ok: true,
      center: { lat: newLat, lon: newLon }, // saved pin location
      measurementCenter: { lat: measureLat, lon: measureLon }, // adaptive
      geoSource, measured, raw, horizon, full: !!full,
      boundary: b.poly, boundarySource: b.source, boundaryFetched: b.fetched,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Measure failed" }, { status: 500 });
  }
}
