// Place resolution — the v2 entry-atom keystone (#13). Every entry that
// happens somewhere resolves to a Google place_id (the same key as the `pois`
// cache), so one identity feeds the day map, Solve's travel math, dedup, and
// once-verified markers. Pool candidates already carry a place_id (they come
// from the cache); ADD-YOUR-OWN entries and the Slovenia v1→v2 migration need
// this searchText → place_id lookup.
//
// THE NEVER-INVENT RULE: an unresolvable query returns null — never a
// fabricated id or coordinates. A null place is honest ("happens somewhere we
// couldn't pin"); a guessed one is the original sin this project exists to fix.
//
// Isomorphic (global fetch): runs in the Next server route AND the migration
// node script. Key comes from opts.apiKey (scripts pass the Keychain key) or
// process.env.GOOGLE_PLACES_API_KEY (the server route). NEVER the public key.

const TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.location", "places.formattedAddress",
  "places.primaryType", "places.types", "places.rating", "places.userRatingCount",
  "places.businessStatus",
].join(",");

function apiKey(opts = {}) {
  const key = opts.apiKey || (typeof process !== "undefined" ? process.env.GOOGLE_PLACES_API_KEY : null);
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY missing (server env) and no apiKey passed");
  return key;
}

// Shape a Google place → our candidate (mirrors the pois-cache columns so a
// resolved candidate can be upserted straight into `pois`).
function toCandidate(p) {
  if (!p?.id || !p.location) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text || null,
    lat: p.location.latitude,
    lon: p.location.longitude,
    address: p.formattedAddress || null,
    primaryType: p.primaryType || null,
    types: p.types || null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    businessStatus: p.businessStatus || null,
  };
}

// Ranked candidates for the EntryEditor's place picker. `near = { lat, lon,
// radius? }` biases (not restricts) toward the leg. Returns [] on no match —
// never throws on an empty result, only on a transport/key failure.
export async function searchPlaces(textQuery, opts = {}) {
  const q = String(textQuery || "").trim();
  if (!q) return [];
  const { near, limit = 8 } = opts;
  const body = {
    textQuery: near?.cityName ? `${q}, ${near.cityName}` : q,
    maxResultCount: Math.min(Math.max(limit, 1), 20),
  };
  if (near?.lat != null && near?.lon != null) {
    body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lon }, radius: near.radius || 5000 } };
  }
  const r = await fetch(TEXT_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey(opts), "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "Places searchText failed");
  return (j.places || []).map(toCandidate).filter(Boolean);
}

// Resolve a single searchText to its best place, or honest null. Used by
// add-your-own and the migration. `{ placeId, name, lat, lon, address } | null`.
export async function resolvePlace(textQuery, opts = {}) {
  const candidates = await searchPlaces(textQuery, { ...opts, limit: 1 });
  const top = candidates[0];
  if (!top) return null;
  return { placeId: top.placeId, name: top.name, lat: top.lat, lon: top.lon, address: top.address };
}
