import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  measureAround, findVisitCenter, findVisitCenters, nearestWaterMulti,
  rankedWaterBodies, distanceToTarget, nearestWater, geocodeHeart,
  measureCensus, measureWalkScore, measureClimate, measureBuildingCoverage, measureSkyline,
  measureHorizonPeaks, composite,
} from "../../../lib/measure";

// A few external calls; allow up to the plan ceiling.
export const maxDuration = 60;

/**
 * POST /api/measure
 * body: { cityId, lat?, lon?, recenter?, full? }
 *  - lat/lon       → measure around that exact point (user moved the pin)
 *  - recenter:true → recenter on the densest walkable cluster, then measure
 *  - full:true     → also refresh keyed/slow layers (Census, Walk Score,
 *                    climate, building coverage). Default is the fast
 *                    location-core (OSM + elevation + water, no keys) — the
 *                    things that actually change when you nudge a pin.
 * Always MERGES into measured_metrics so other layers aren't clobbered.
 */
export async function POST(request) {
  try {
    const { cityId, lat, lon, recenter, full, scout, water, setWaterTarget } = await request.json();
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
      .select("id,name,heart_intersection,lat,lon,measured_metrics,water_target").eq("id", cityId).single();
    if (readErr) throw new Error(readErr.message);

    // Scout mode: return candidate cores (with water distance each) so the user
    // can choose which one to base a visit around. No measuring, no DB write.
    if (scout) {
      let anchor = (city.lat != null && city.lon != null) ? { lat: city.lat, lon: city.lon } : null;
      if (!anchor) anchor = await geocodeHeart(city.heart_intersection, city.name);
      if (!anchor) throw new Error("Could not locate this city — set a point manually.");
      const cands = await findVisitCenters(anchor.lat, anchor.lon);
      // ONE water fetch around the anchor, then distance per candidate locally.
      const waters = await nearestWaterMulti(anchor.lat, anchor.lon, cands);
      const candidates = cands.map((c, i) => ({ ...c, water_dist_m: waters[i] }));
      return NextResponse.json({ ok: true, scout: true, current: { lat: city.lat, lon: city.lon }, candidates });
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
      const { dist, point } = target
        ? await distanceToTarget(city.lat, city.lon, target)
        : await nearestWater(city.lat, city.lon);
      const merged = { ...(city.measured_metrics || {}) };
      merged.water_dist_m = { value: dist, asOf, source: target ? `OpenStreetMap — target: ${target.name}` : "OpenStreetMap (Overpass)", point: point || null };
      const raw = {}; for (const [k, v] of Object.entries(merged)) raw[k] = v?.value;
      const measured = composite(raw);
      const { error: wErr } = await supabase.from("cities")
        .update({ measured_metrics: merged, measured, water_target: target }).eq("id", cityId);
      if (wErr) throw new Error(wErr.message);
      return NextResponse.json({ ok: true, waterTarget: target, water_dist_m: dist, measured, measuredMetrics: merged });
    }
    let center, geoSource;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      center = { lat, lon }; geoSource = "manual (placed by user)";
    } else {
      let anchor = (city.lat != null && city.lon != null) ? { lat: city.lat, lon: city.lon } : null;
      if (!anchor) anchor = await geocodeHeart(city.heart_intersection, city.name);
      if (!anchor) throw new Error("Could not locate this city — set a point manually.");
      if (recenter) {
        const vc = await findVisitCenter(anchor.lat, anchor.lon);
        center = { lat: vc.lat, lon: vc.lon };
        geoSource = `visit center: densest walkable cluster (${vc.n} POIs)`;
      } else {
        center = anchor;
        geoSource = city.lat != null ? undefined : "Nominatim (heart intersection)";
      }
    }

    // A moved pin is a new place — re-measure EVERY layer for the new point.
    // `full:false` can opt down to the no-key core, but default is everything,
    // and all layers run concurrently so wall-clock ≈ the slowest single call.
    const doFull = full !== false;
    const censusKey = process.env.CENSUS_API_KEY;
    const wsKey = process.env.WALKSCORE_API_KEY;
    const [core, cen, ws, cl, bc, sky, horizon] = await Promise.all([
      measureAround(center.lat, center.lon, { asOf }),
      doFull && censusKey ? measureCensus(center.lat, center.lon, censusKey, { asOf }) : Promise.resolve({ metrics: {} }),
      doFull && wsKey ? measureWalkScore(center.lat, center.lon, city.name, wsKey, { asOf }) : Promise.resolve({}),
      doFull ? measureClimate(center.lat, center.lon, { asOf }) : Promise.resolve({ metrics: {} }),
      doFull ? measureBuildingCoverage(center.lat, center.lon) : Promise.resolve({}),
      doFull ? measureSkyline(center.lat, center.lon, { asOf }) : Promise.resolve({ metrics: {} }),
      doFull ? measureHorizonPeaks(center.lat, center.lon, { asOf }).catch(() => null) : Promise.resolve(null),
    ]);
    const newMetrics = { ...core.metrics, ...cen.metrics, ...ws, ...cl.metrics, ...bc, ...sky.metrics };

    // If a water target is set, the center moved — re-route water to THAT body
    // rather than auto-nearest, so the user's choice persists across re-measures.
    if (city.water_target && newMetrics.water_dist_m) {
      const td = await distanceToTarget(center.lat, center.lon, city.water_target);
      if (td.dist != null) newMetrics.water_dist_m = { value: td.dist, asOf, source: `OpenStreetMap — target: ${city.water_target.name}`, point: td.point };
    }

    // Merge over existing so untouched layers survive; recompute composite.
    const merged = { ...(city.measured_metrics || {}), ...newMetrics };
    const raw = {};
    for (const [k, v] of Object.entries(merged)) raw[k] = v?.value;

    const patch = {
      measured_metrics: merged,
      measured: composite(raw),
      measured_at: asOf,
      lat: center.lat, lon: center.lon, geocoded_at: asOf,
    };
    if (geoSource) patch.geo_source = geoSource;
    if (horizon) patch.horizon_features = horizon; // visible named peaks + occupancy

    const { error: writeErr } = await supabase.from("cities").update(patch).eq("id", cityId);
    if (writeErr) throw new Error(writeErr.message);

    return NextResponse.json({ ok: true, center, geoSource, measured: patch.measured, raw, horizon, full: !!full });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Measure failed" }, { status: 500 });
  }
}
