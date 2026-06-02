import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { measureAround, findVisitCenter, geocodeHeart } from "../../../lib/measure";

// Allow up to a minute — the routine makes a few external calls (Overpass,
// elevation). Vercel honors this up to the plan's ceiling.
export const maxDuration = 60;

/**
 * POST /api/measure
 * body: { cityId, lat?, lon?, recenter? }
 *  - lat/lon present  → measure around that exact point (user moved the pin),
 *                       persist it as a manual center.
 *  - recenter: true   → find the densest walkable cluster near the current
 *                       point, recenter there, then measure.
 *  - neither          → measure around the stored point (or geocode the heart
 *                       if none yet).
 * Runs as the calling user (their access token) under RLS.
 */
export async function POST(request) {
  try {
    const { cityId, lat, lon, recenter } = await request.json();
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
      .select("id,name,heart_intersection,lat,lon").eq("id", cityId).single();
    if (readErr) throw new Error(readErr.message);

    // Decide the center.
    let center, geoSource;
    const asOf = new Date().toISOString().slice(0, 10);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      center = { lat, lon };
      geoSource = "manual (placed by user)";
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

    const result = await measureAround(center.lat, center.lon, { asOf });

    const patch = {
      measured_metrics: result.metrics,
      measured: result.measured,
      measured_at: asOf,
      lat: center.lat, lon: center.lon, geocoded_at: asOf,
    };
    if (geoSource) patch.geo_source = geoSource;

    const { error: writeErr } = await supabase.from("cities").update(patch).eq("id", cityId);
    if (writeErr) throw new Error(writeErr.message);

    return NextResponse.json({ ok: true, center, geoSource, measured: result.measured, raw: result.raw });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Measure failed" }, { status: 500 });
  }
}
