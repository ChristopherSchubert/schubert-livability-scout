// Mapping between the app's camelCase city object and the snake_case `cities`
// row in Supabase. Shared by the seed script and the runtime data layer so
// the column contract lives in exactly one place.
import { citySlug } from "./planner-data.js";

// drive_hrs_from_pit is stored as text so it can hold "FLY" alongside numbers.
// Decode to (number | "FLY" | null) on the way in; encode the inverse on save.
function decodeDriveHrs(v) {
  if (v == null || v === "") return null;
  if (v === "FLY") return "FLY";
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function encodeDriveHrs(v) {
  if (v == null) return null;
  if (v === "FLY") return "FLY";
  return Number.isFinite(v) ? String(v) : null;
}

// season_notes carried legacy `{ charm, truth }` keys before the 2026-06-09
// rename to `{ prime, offSeason }`. Map old → new on read so existing rows
// surface the current keys; cityToRow writes the new keys, so a row migrates
// to the new shape the next time it's saved (no destructive bulk migration).
function normalizeSeasonNotes(notes) {
  if (!notes || typeof notes !== "object") return null;
  const out = { ...notes };
  if (out.charm != null && out.prime == null) out.prime = out.charm;
  if (out.truth != null && out.offSeason == null) out.offSeason = out.truth;
  delete out.charm;
  delete out.truth;
  return out;
}

// Shared (non per-user) city fields that live on the `cities` row.
export function cityToRow(c) {
  return {
    name: c.name,
    slug: citySlug(c),
    stay_zone: c.stayZone ?? null,
    heart_intersection: c.heartIntersection ?? null,
    trip_week: c.tripWeek ?? null,
    why: c.why ?? null,
    blocks: c.blocks ?? [],
    block_geometries: c.blockGeometries ?? [],
    block_blurbs: c.blockBlurbs ?? [],
    poi_positions: c.poiPositions ?? [],
    walking_core_center: c.walkingCoreCenter ?? null,
    nearby_feature: c.nearbyFeature ?? null,
    status: c.status ?? "Idea",
    decision: c.decision ?? "Undecided",
    is_calibration: c.isCalibration ?? false,
    hero_image: c.heroImage ?? null,
    arrive_date: c.arriveDate || null,
    depart_date: c.departDate || null,
    trip_length: c.tripLength ?? null,
    flight_details: c.flightDetails ?? null,
    car_details: c.carDetails ?? null,
    lodging_details: c.lodgingDetails ?? null,
    logistics_notes: c.logisticsNotes ?? null,
    itinerary: c.itinerary ?? null,
    days: c.days ?? [],
    checklists: c.checklists ?? {},
    measured_metrics: c.measuredMetrics ?? {},
    water_target: c.waterTarget ?? null,
    stay_zone_boundary: c.stayZoneBoundary ?? null,
    horizon_features: c.horizonFeatures ?? null,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    visit_climate: c.visitClimate ?? null,
    crowd_season: c.crowdSeason ?? null,
    crowd_intensity: c.crowdIntensity ?? null,
    nps_unit_code: c.npsUnitCode ?? null,
    season_notes: c.seasonNotes ?? null,
    drive_hrs_from_pit: encodeDriveHrs(c.driveHrsFromPit),
    planning_order: c.planningOrder ?? null,
  };
}

// Row → app object. The per-user `survey` is merged in separately by the
// caller (it comes from felt_surveys, not the shared row).
export function rowToCity(r) {
  return {
    id: r.id,
    name: r.name,
    stayZone: r.stay_zone || "",
    heartIntersection: r.heart_intersection || "",
    tripWeek: r.trip_week || "",
    why: r.why || "",
    blocks: r.blocks || [],
    blockGeometries: r.block_geometries || [],
    blockBlurbs: r.block_blurbs || [],
    poiPositions: r.poi_positions || [],
    walkingCoreCenter: r.walking_core_center || null,
    nearbyFeature: r.nearby_feature || null,
    status: r.status || "Idea",
    decision: r.decision || "Undecided",
    isCalibration: r.is_calibration ?? false,
    heroImage: r.hero_image || "",
    arriveDate: r.arrive_date || "",
    departDate: r.depart_date || "",
    tripLength: r.trip_length || "7 nights",
    flightDetails: r.flight_details || "",
    carDetails: r.car_details || "",
    lodgingDetails: r.lodging_details || "",
    logisticsNotes: r.logistics_notes || "",
    itinerary: r.itinerary || null,
    days: r.days || [],
    checklists: r.checklists || {},
    measuredMetrics: r.measured_metrics || {},
    waterTarget: r.water_target || null,
    stayZoneBoundary: r.stay_zone_boundary || null,
    horizonFeatures: r.horizon_features || null,
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    geoSource: r.geo_source || null,
    visitClimate: r.visit_climate || null,
    crowdSeason: r.crowd_season || null,
    crowdIntensity: r.crowd_intensity ?? null,
    npsUnitCode: r.nps_unit_code || null,
    seasonNotes: normalizeSeasonNotes(r.season_notes),
    driveHrsFromPit: decodeDriveHrs(r.drive_hrs_from_pit),
    planningOrder: r.planning_order ?? null,
  };
}
