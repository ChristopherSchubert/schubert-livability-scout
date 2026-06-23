import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rowToCity } from "../../../lib/city-row.js";
import { buildCityDetailView, buildHomebaseView } from "../../../lib/city-detail-view.js";

// GET /api/mockup-data?slug=newport-ri
//
// Returns a single JSON envelope for the magazine city-detail page, generated
// fresh from Supabase on every request. The static mockup
// (public/city-detail-redesign.html) fetches this; the live React route builds
// the same shape in-process via lib/city-detail-view.js, so both stay in lock-
// step — the shaping lives in exactly one place now.
//
// Server-side only — uses the Supabase service-role key (SUPABASE_SECRET_KEY,
// .env.local + Vercel env, never in the bundle) so it bypasses the `cities`
// RLS (authed-only select) without exposing a public read policy. The cities
// table holds non-PII shared candidate data and nothing here mutates, so a
// server-mediated read is appropriate. Falls back to the publishable key for
// dev convenience (returns 503 with a clear message if neither is set).
// (#97 — was using lib/measurers/_db.js which reads the macOS Keychain;
//  Vercel has no `security` binary, so prod threw `spawnSync security ENOENT`.)

const HOMEBASE_SLUG = "allison-park-pa";
const DEFAULT_SLUG = "newport-ri";

export const dynamic = "force-dynamic";

const CORS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || DEFAULT_SLUG;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer the service-role key (bypasses RLS); fall back to the publishable
  // key for local probing. In prod the publishable key returns [] because
  // cities RLS gates anon reads — set SUPABASE_SECRET_KEY on Vercel.
  const key = process.env.SUPABASE_SECRET_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json(
      { error: "Server not configured: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY required." },
      { status: 503, headers: CORS },
    );
  }

  try {
    const sb = createClient(supabaseUrl, key, { auth: { persistSession: false }, db: { schema: "travel" } });
    const { data: rows, error } = await sb
      .from("cities")
      .select("*")
      .in("slug", [slug, HOMEBASE_SLUG]);
    if (error) throw error;
    const bySlug = Object.fromEntries((rows || []).map((r) => [r.slug, r]));
    if (!bySlug[slug]) {
      return NextResponse.json({ error: `No city with slug "${slug}"` }, { status: 404, headers: CORS });
    }
    const city = rowToCity(bySlug[slug]);
    const homebaseRow = bySlug[HOMEBASE_SLUG];

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      city: buildCityDetailView(city, { slug }),
      homebase: homebaseRow
        ? buildHomebaseView(rowToCity(homebaseRow), { slug: HOMEBASE_SLUG })
        : null,
    }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500, headers: CORS });
  }
}
