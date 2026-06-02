import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  measureAround, findVisitCenter, geocodeHeart,
  measureCensus, measureWalkScore, measureClimate, measureBuildingCoverage, composite,
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
    const { cityId, lat, lon, recenter, full } = await request.json();
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
      .select("id,name,heart_intersection,lat,lon,measured_metrics").eq("id", cityId).single();
    if (readErr) throw new Error(readErr.message);

    const asOf = new Date().toISOString().slice(0, 10);
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

    // Fast location-core (no keys).
    const core = await measureAround(center.lat, center.lon, { asOf });
    let newMetrics = { ...core.metrics };

    // Optional keyed/slow layers.
    if (full) {
      const censusKey = process.env.CENSUS_API_KEY;
      const wsKey = process.env.WALKSCORE_API_KEY;
      const [cen, ws, cl, bc] = await Promise.all([
        censusKey ? measureCensus(center.lat, center.lon, censusKey, { asOf }) : Promise.resolve({ metrics: {} }),
        wsKey ? measureWalkScore(center.lat, center.lon, city.name, wsKey, { asOf }) : Promise.resolve({}),
        measureClimate(center.lat, center.lon, { asOf }),
        measureBuildingCoverage(center.lat, center.lon),
      ]);
      newMetrics = { ...newMetrics, ...cen.metrics, ...ws, ...cl.metrics, ...bc };
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

    const { error: writeErr } = await supabase.from("cities").update(patch).eq("id", cityId);
    if (writeErr) throw new Error(writeErr.message);

    return NextResponse.json({ ok: true, center, geoSource, measured: patch.measured, raw, full: !!full });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Measure failed" }, { status: 500 });
  }
}
