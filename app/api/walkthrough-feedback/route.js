import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Receives feedback notes from the trip-walkthrough deck (a public static
// page — Janice reviews without signing in). Insert-only through the
// publishable key; RLS on walkthrough_feedback allows anon INSERT and
// nothing else, so this endpoint can't be used to read anything back.
// CORS is open because the deck is also driven from the local static
// preview server during development.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400, headers: CORS });
  }
  const slide = Number(body.slide);
  const note = String(body.note || "").trim().slice(0, 4000);
  const phase = String(body.phase || "").slice(0, 200);
  if (!Number.isInteger(slide) || slide < 1 || slide > 500 || !note) {
    return NextResponse.json({ error: "slide (1-based int) and note required." }, { status: 400, headers: CORS });
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false }, db: { schema: "travel" } },
  );
  const { error } = await sb.from("walkthrough_feedback").insert({
    slide, phase, note,
    ua: (req.headers.get("user-agent") || "").slice(0, 300),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ ok: true }, { status: 201, headers: CORS });
}
