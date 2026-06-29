import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rowToTrip } from "../../../lib/trip.js";
import { rowToCity } from "../../../lib/city-row.js";
import { appStatus } from "../../../lib/app-status.js";
import { verifyServiceToken } from "../../../lib/feed-token.js";

// GET /api/status — the family-hub app-status endpoint (#113, per hub #76 +
// ADR 0005). The hub's app tile pulls one rich status object (level + headline
// + metrics) from each spoke. Finance has it; this is Travel's.
//
// Auth mirrors /api/feed: an HS256 `Authorization: Bearer` service token signed
// with the shared FEED_SERVICE_TOKEN_SIGNING_KEY; tokenless / bad-token → 401.
// Derives level/headline from REAL trip + planning state (never hardcoded).
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request) {
  const auth = verifyServiceToken(request.headers.get("authorization"), process.env.FEED_SERVICE_TOKEN_SIGNING_KEY);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Server not configured: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY required." },
      { status: 503, headers: noStore },
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false }, db: { schema: "travel" } });
  // Same two trip sources as the feed (multi-city trips + single-city scheduled
  // visits), plus the trip entries (for real booking-gap detection) and a cheap
  // count of tracked cities.
  const [tripsRes, entriesRes, citiesRes, countRes] = await Promise.all([
    sb.from("trips").select("*").order("start_date", { ascending: true }),
    sb.from("trip_entries").select("id,trip_id,day,sort,payload"),
    sb.from("cities").select("*").eq("status", "Scheduled").not("arrive_date", "is", null).neq("arrive_date", ""),
    sb.from("cities").select("id", { count: "exact", head: true }),
  ]);
  if (tripsRes.error || entriesRes.error || citiesRes.error || countRes.error) {
    return NextResponse.json({ error: "status query failed" }, { status: 502, headers: noStore });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  // Hydrate each trip with its entries (trip_entries row → app entry: id/day/sort
  // promoted out of the jsonb payload, same as lib/db.js#rowToEntry).
  const entriesByTrip = {};
  for (const r of entriesRes.data || []) {
    const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day || null;
    (entriesByTrip[r.trip_id] ||= []).push({ id: r.id, day, sort: r.sort ?? 0, ...(r.payload || {}) });
  }
  const trips = (tripsRes.data || []).map((r) => {
    const t = rowToTrip(r);
    t.entries = entriesByTrip[r.id] || [];
    return t;
  });
  const visits = (citiesRes.data || []).map((r) => ({ ...rowToCity(r), slug: r.slug }));

  const status = appStatus(
    { trips, visits, citiesCount: countRes.count ?? 0 },
    { now: new Date(), baseUrl },
  );
  return NextResponse.json(status, { headers: noStore });
}
