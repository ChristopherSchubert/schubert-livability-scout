import { NextResponse } from "next/server";
import { imageSearch } from "../../../../lib/image-manifest";

export async function POST(request) {
  try {
    const body = await request.json();
    const results = await imageSearch(String(body.query || ""), Number(body.page || 1), String(body.cityName || ""));
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Search failed" }, { status: 500 });
  }
}
