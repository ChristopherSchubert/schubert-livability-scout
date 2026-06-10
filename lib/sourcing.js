// Candidate sourcing — the Gather system. Turns the cached `pois` (Google
// Places) near a leg into a ranked, categorised candidate pool, so Gather is
// populated from real data, not hand-typed. See features/trip-planner-systems.md
// §1–2. Pure functions; the DB radius query lives in the caller.

// Google primaryType -> our { kind (the 6-color key), category (pool grouping) }.
// kind drives the entry color once scheduled; category groups the pool.
const TYPE_MAP = [
  [/restaurant|cafe|coffee|bar$|bar_and_grill|bakery|dessert|ice_cream|food|meal_|bistro|pub|brunch|brewery|wine|tea_house/, { kind: "meal", category: "Eat & drink" }],
  [/hotel|lodging|bed_and_breakfast|guest_house|resort|hostel|motel|cottage|inn/, { kind: "checkin", category: "Stay" }],
  [/castle|museum|gallery|tourist_attraction|historical|landmark|monument|amphitheatre|cultural/, { kind: "flexible", category: "See" }],
  [/park|hiking|trail|nature|garden|beach|lake|scenic|viewpoint|zoo|aquarium|wildlife/, { kind: "flexible", category: "Outdoors" }],
  [/adventure|sports|zipline|climbing|ski|kayak|rafting|amusement|water_park|spa|wellness/, { kind: "booked", category: "Do" }],
  [/store|shop|market|mall|boutique/, { kind: "todo", category: "Shop" }],
];
export function categorize(primaryType) {
  const t = (primaryType || "").toLowerCase();
  for (const [re, v] of TYPE_MAP) if (re.test(t)) return v;
  return { kind: "flexible", category: "Other" };
}

// Popularity-weighted quality: rewards a high rating backed by many reviews,
// so a 5.0 with 12 ratings doesn't outrank a 4.6 with 4,000.
export function confidenceScore(poi) {
  const r = poi.rating || 0, n = poi.user_rating_count || 0;
  return +(r * Math.log10(n + 1)).toFixed(2);
}

const PRICE = {
  PRICE_LEVEL_INEXPENSIVE: "€", PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€", PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

// Markers, HONESTLY derived. Attribute markers (dog/veg/kid/patio/accessible/
// cash-only) come from pois.attributes — the Place Details blob fetched by
// scripts/fetch-poi-attributes.mjs (migration 0014) — each cited with the fetch
// date. A field absent from the blob (or no blob at all) yields NO marker:
// null means "not verified", never a guessed ✅. Explicit `false` also yields
// no marker — these chips assert presence, not absence (absence-of-dog-
// friendliness shows up in StatusMatrix-style views, not as a pool chip).
export function deriveMarkers(poi) {
  const markers = [];
  if (poi.price_level && PRICE[poi.price_level]) {
    markers.push({ type: "price", value: PRICE[poi.price_level], source: "Google Places" });
  }
  const a = poi.attributes;
  if (a && typeof a === "object") {
    const when = poi.attributes_fetched_at
      ? new Date(poi.attributes_fetched_at).toISOString().slice(0, 10) : null;
    const source = when ? `Google Places · ${when}` : "Google Places";
    if (a.allowsDogs === true) markers.push({ type: "dog", source });
    if (a.servesVegetarianFood === true) markers.push({ type: "veg", source });
    if (a.goodForChildren === true) markers.push({ type: "kid", source });
    if (a.outdoorSeating === true) markers.push({ type: "patio", source });
    if (a.accessibilityOptions?.wheelchairAccessibleEntrance === true ||
        a.accessibilityOptions?.wheelchairAccessibleSeating === true) {
      markers.push({ type: "accessible", source });
    }
    if (a.paymentOptions?.acceptsCashOnly === true) markers.push({ type: "cashOnly", source });
  }
  return markers;
}

// Opening hours for Solve's soft constraint (§5) — human-readable weekday
// lines straight from the attributes blob; null when not fetched/provided.
export function openingHours(poi) {
  return poi.attributes?.regularOpeningHours?.weekdayDescriptions ?? null;
}

// Shape + rank a raw pois[] into the candidate pool.
export function buildPool(rawPois, { origin } = {}) {
  const haversineKm = (a, b) => {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  return rawPois.map((p) => {
    const { kind, category } = categorize(p.primary_type);
    return {
      placeId: p.place_id,
      name: p.name,
      kind, category,
      place: { lat: p.lat, lon: p.lon, address: p.formatted_address || null },
      rating: p.rating ?? null,
      ratingCount: p.user_rating_count ?? null,
      score: confidenceScore(p),
      distanceKm: origin ? +haversineKm(origin, { lat: p.lat, lon: p.lon }).toFixed(2) : null,
      markers: deriveMarkers(p),
      hours: openingHours(p),
    };
  }).sort((a, b) => b.score - a.score);
}
