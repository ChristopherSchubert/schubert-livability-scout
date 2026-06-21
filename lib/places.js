// Shared geographic-place guard + kind inference for places-search results.
// Used by the Plan-tab suggestion anchor (cold-start trip-name geocode) and the
// trip region chips (#79) so the never-invent rule lives in exactly one place.

// Google-Places types that read as a PLACE — a region, locality, admin area, or
// natural feature — never a business that happens to match the words.
export const GEO_PLACE_TYPES = new Set([
  "political", "locality", "sublocality", "neighborhood", "colloquial_area",
  "administrative_area_level_1", "administrative_area_level_2",
  "administrative_area_level_3", "natural_feature", "archipelago",
  "country", "postal_code",
]);

// A result counts as geographic only if it has a real center AND a geographic
// type. No center → not usable (honours never-invent: no guessed coordinates).
export const isGeographicPlace = (p) =>
  !!p && p.lat != null && p.lon != null &&
  (p.types || []).some((t) => GEO_PLACE_TYPES.has(t));

// A US state resolves to administrative_area_level_1; everything else geographic
// (valley, mountain range, county, locality) reads as a "region".
export const regionKind = (types) =>
  (types || []).includes("administrative_area_level_1") ? "state" : "region";
