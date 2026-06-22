import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rowToTrip } from "../../../lib/trip.js";
import { feedFromTrips } from "../../../lib/feed.js";
import { verifyServiceToken } from "../../../lib/feed-token.js";

// GET /api/feed — the family-hub feed endpoint (#93, epic #84).
//
// Stateless, household-scoped, ~1 summary card per trip, matching feed-contract
// v1 (../schubert-family/src/lib/feed-contract.ts; conformance/check-feed.mjs).
// The hub pulls it with an HS256 `Authorization: Bearer` service token signed
// with FEED_SERVICE_TOKEN_SIGNING_KEY; tokenless / bad-token calls get 401.
// SUMMARIES ONLY — lib/feed.js maps trips to cards that carry no raw rows.
//
// Follow-ups (epic #84):
//   • Household scope + per-card member_id resolution land with identity (#90) —
//     current_household_id() / member mapping. Until then this returns every
//     trip (one household today) with member_id=null (household-wide).
//   • The source re-points to the `travel` schema in Ticket 4 (#91) — add
//     { db: { schema: "travel" } } to this client alongside the others.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const signingKey = process.env.FEED_SERVICE_TOKEN_SIGNING_KEY;
  const auth = verifyServiceToken(request.headers.get("authorization"), signingKey);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Server not configured: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY required." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("trips")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "feed query failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const trips = (data || []).map(rowToTrip);
  const feed = feedFromTrips(trips, { now: new Date(), baseUrl });

  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
