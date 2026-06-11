// Place resolution (issue #13) — the map keystone. Resolves a free-text place
// ("Hiša Franko", "the B&B behind Teja bar") to a Google `place_id` (the same
// key as the `pois` cache), so one identity feeds the day map, Solve's travel
// math, dedup, and once-verified markers. Add-your-own entries + the Slovenia
// v1→v2 migration (#14) both call this.
//
// SERVER-ONLY: the Google key is secret (env/Keychain), never the public key —
// so this is imported by app/api/places/search/route.js, not the browser.
// Pure-ish by injection: `fetchImpl` is injectable so the shaping logic is
// unit-tested against a mock (the never-invent rule: unresolved → null, never a
// fabricated id/coords).

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.formattedAddress",
  "places.primaryType",
  "places.rating",
  "places.userRatingCount",
].join(",");

// Shape one Google place into our candidate (the pois-row-compatible subset).
function shape(p) {
  if (!p?.id || p.location?.latitude == null) return null; // honest: no id/coords → drop
  return {
    placeId: p.id,
    name: p.displayName?.text || null,
    lat: p.location.latitude,
    lon: p.location.longitude,
    address: p.formattedAddress || null,
    primaryType: p.primaryType || null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
  };
}

// Ranked candidates for a search — for the EntryEditor's place picker.
/**
 * @param {string} searchText
 * @param {{ apiKey?: string, near?: { lat: number, lon: number }, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<Array<object>>}
 */
export async function searchPlaces(searchText, { apiKey, near, fetchImpl = fetch } = {}) {
  const text = String(searchText || "").trim();
  if (!text) return [];
  if (!apiKey) throw new Error("place-resolve: missing Google Places API key");
  const body = {
    textQuery: text,
    ...(near
      ? {
          locationBias: {
            circle: { center: { latitude: near.lat, longitude: near.lon }, radius: 20000 },
          },
        }
      : {}),
  };
  const r = await fetchImpl(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "Google Places search failed");
  return (j.places || []).map(shape).filter(Boolean);
}

// Resolve a single best place, or honestly null. The keystone: callers store
// the returned `placeId` (or null) — never a guess.
/**
 * @param {string} searchText
 * @param {{ apiKey?: string, near?: { lat: number, lon: number }, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<object|null>}
 */
export async function resolvePlace(searchText, opts = {}) {
  const candidates = await searchPlaces(searchText, opts);
  return candidates[0] || null;
}
