import { NextResponse } from "next/server";
import { searchPlaces } from "../../../../lib/place-resolve";

// POST { query, near?: { lat, lon, radius?, cityName? }, limit?, rich?: boolean }
// → ranked place candidates for the EntryEditor's place picker and StaySearch.
// Server-side so the Google key (process.env.GOOGLE_PLACES_API_KEY) never
// reaches the client. Mirrors app/api/images/search/route.js.
// rich:true swaps in the richer field mask (adds googleMapsUri for hotel
// result cards); EntryEditor always calls without rich so its cost tier is
// unchanged.
export async function POST(request) {
  try {
    const body = await request.json();
    const query = String(body.query || "");
    const near = body.near && typeof body.near === "object" ? body.near : undefined;
    const limit = body.limit ? Number(body.limit) : undefined;
    const rich = body.rich === true;
    const results = await searchPlaces(query, { near, limit, rich });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Place search failed" }, { status: 500 });
  }
}
