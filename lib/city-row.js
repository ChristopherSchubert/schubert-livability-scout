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
    seasonNotes: r.season_notes || null,
    driveHrsFromPit: decodeDriveHrs(r.drive_hrs_from_pit),
    planningOrder: r.planning_order ?? null,
  };
}
