// Mapping between the app's camelCase city object and the snake_case `cities`
// row in Supabase. Shared by the seed script and the runtime data layer so
// the column contract lives in exactly one place.
import { citySlug } from "./planner-data.js";

// Shared (non per-user) city fields that live on the `cities` row.
export function cityToRow(c) {
  return {
    name: c.name,
    slug: citySlug(c),
    stay_zone: c.stayZone ?? null,
    heart_intersection: c.heartIntersection ?? null,
    trip_week: c.tripWeek ?? null,
    why: c.why ?? null,
    if_wins: c.ifWins ?? null,
    if_fails: c.ifFails ?? null,
    blocks: c.blocks ?? [],
    status: c.status ?? "Idea",
    decision: c.decision ?? "Undecided",
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
    matrix: c.matrix ?? {},
    measured: c.measured ?? null,
    measured_metrics: c.measuredMetrics ?? {},
    water_target: c.waterTarget ?? null,
    horizon_features: c.horizonFeatures ?? null,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    visit_climate: c.visitClimate ?? null,
    crowd_season: c.crowdSeason ?? null,
    season_notes: c.seasonNotes ?? null,
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
    ifWins: r.if_wins || "",
    ifFails: r.if_fails || "",
    blocks: r.blocks || [],
    status: r.status || "Idea",
    decision: r.decision || "Undecided",
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
    matrix: r.matrix || {},
    measured: r.measured,
    measuredMetrics: r.measured_metrics || {},
    waterTarget: r.water_target || null,
    horizonFeatures: r.horizon_features || null,
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    geoSource: r.geo_source || null,
    visitClimate: r.visit_climate || null,
    crowdSeason: r.crowd_season || null,
    seasonNotes: r.season_notes || null,
  };
}
