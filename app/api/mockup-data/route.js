import { NextResponse } from "next/server";
import { connect } from "../../../lib/measurers/_db.js";
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
// Server-side only — uses the direct pg connection (lib/measurers/_db.js),
// so RLS is bypassed and no auth is required from the browser. That's
// appropriate: cities table holds non-PII shared candidate data, and
// nothing here is mutating.

const HOMEBASE_SLUG = "allison-park-pa";
const DEFAULT_SLUG = "newport-ri";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || DEFAULT_SLUG;

  let client;
  try {
    client = await connect();
    const { rows } = await client.query(
      `select * from cities where slug = any($1::text[])`,
      [[slug, HOMEBASE_SLUG]]
    );
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    if (!bySlug[slug]) {
      return NextResponse.json({ error: `No city with slug "${slug}"` }, { status: 404 });
    }
    const city = rowToCity(bySlug[slug]);
    const homebaseRow = bySlug[HOMEBASE_SLUG];

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      city: buildCityDetailView(city, { slug }),
      homebase: homebaseRow
        ? buildHomebaseView(rowToCity(homebaseRow), { slug: HOMEBASE_SLUG })
        : null,
    }, {
      // CORS — the static-server preview at :8765 fetches this from a
      // different origin during design iteration. The route is read-only
      // and exposes only non-PII shared candidate data, so wide-open is
      // fine. Cache-Control keeps every request fresh.
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}
