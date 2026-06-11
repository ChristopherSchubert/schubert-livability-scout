import { NextResponse } from "next/server";
import { searchPlaces } from "../../../../lib/place-resolve";

// Server-side place search (issue #13). Mirrors app/api/images/search for shape
// + auth: the Google Places key stays server-only (never the public key). The
// EntryEditor's place picker + the migration call this; cache upsert into `pois`
// is a documented follow-up (needs a server-side DB writer — see #13).
export async function POST(request) {
  try {
    const body = await request.json();
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GKEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Places API key not configured" }, { status: 503 });
    }
    const near =
      body.near && Number.isFinite(body.near.lat) && Number.isFinite(body.near.lon)
        ? { lat: body.near.lat, lon: body.near.lon }
        : undefined;
    const results = await searchPlaces(String(body.query || ""), { apiKey, near });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Search failed" }, { status: 500 });
  }
}
