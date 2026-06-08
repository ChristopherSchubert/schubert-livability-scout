"use client";

// Runtime data-access layer over Supabase. Cities are shared; felt surveys,
// baseline ratings, and weights are per-user. All reads/writes go through the
// browser client (gated by RLS).
import { getSupabase } from "./supabase.js";
import { rowToCity, cityToRow } from "./city-row.js";
import { emptySurvey } from "./planner-data.js";

const SURVEY_COLS = ["setting", "aliveness", "fabric", "realness", "january", "slovenia", "note", "context", "taken_at"];

function surveyToRow(s) {
  return {
    setting: s.setting, aliveness: s.aliveness, fabric: s.fabric,
    realness: s.realness, january: s.january, slovenia: s.slovenia,
    note: s.note || "", context: s.context || "", taken_at: s.takenAt || null,
  };
}
function rowToSurvey(r) {
  if (!r) return emptySurvey();
  return {
    setting: r.setting, aliveness: r.aliveness, fabric: r.fabric,
    realness: r.realness, january: r.january, slovenia: r.slovenia,
    note: r.note || "", context: r.context || "", takenAt: r.taken_at || "",
  };
}

// ── Cities (shared) ────────────────────────────────────────────────────────
export async function fetchCities() {
  const sb = getSupabase();
  const { data, error } = await sb.from("cities").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToCity);
}

export async function saveCityFields(cityId, patch) {
  // Only shared (non-survey) fields. `patch` is a camelCase partial city;
  // mapPatch keeps just the columns it actually touches.
  const sb = getSupabase();
  const { error } = await sb.from("cities").update(mapPatch(patch)).eq("id", cityId);
  if (error) throw error;
}

// Map a camelCase city patch to just the snake columns it touches.
function mapPatch(patch) {
  const M = {
    name: "name", stayZone: "stay_zone", heartIntersection: "heart_intersection",
    tripWeek: "trip_week", why: "why",
    blocks: "blocks", blockGeometries: "block_geometries", poiPositions: "poi_positions", status: "status", decision: "decision", isCalibration: "is_calibration", heroImage: "hero_image",
    arriveDate: "arrive_date", departDate: "depart_date", tripLength: "trip_length",
    flightDetails: "flight_details", carDetails: "car_details", lodgingDetails: "lodging_details",
    logisticsNotes: "logistics_notes", days: "days", checklists: "checklists",
    measuredMetrics: "measured_metrics", waterTarget: "water_target",
    stayZoneBoundary: "stay_zone_boundary",
    horizonFeatures: "horizon_features", lat: "lat", lon: "lon",
    visitClimate: "visit_climate", crowdSeason: "crowd_season", crowdIntensity: "crowd_intensity", npsUnitCode: "nps_unit_code", seasonNotes: "season_notes",
    driveHrsFromPit: "drive_hrs_from_pit",
    planningOrder: "planning_order",
  };
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!M[k]) continue;
    if (k === "driveHrsFromPit") {
      // Text column; encode number → string, keep "FLY" / null as-is.
      out[M[k]] = v == null ? null : (v === "FLY" ? "FLY" : String(v));
    } else {
      out[M[k]] = v === undefined ? null : v;
    }
  }
  return out;
}

export async function insertCity(city) {
  const sb = getSupabase();
  const { data, error } = await sb.from("cities").insert(cityToRow(city)).select().single();
  if (error) throw error;
  return rowToCity(data);
}

// ── Felt surveys (per-user) ──────────────────────────────────────────────────
export async function fetchMySurveys(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from("felt_surveys").select("*").eq("user_id", userId);
  if (error) throw error;
  const byCity = {};
  for (const r of data || []) byCity[r.city_id] = rowToSurvey(r);
  return byCity;
}

// All surveys (both users) for comparison views, keyed city_id -> [{userId, survey}].
export async function fetchAllSurveys() {
  const sb = getSupabase();
  const { data, error } = await sb.from("felt_surveys").select("*");
  if (error) throw error;
  const byCity = {};
  for (const r of data || []) {
    (byCity[r.city_id] ||= []).push({ userId: r.user_id, survey: rowToSurvey(r) });
  }
  return byCity;
}

export async function upsertSurvey(cityId, userId, survey) {
  const sb = getSupabase();
  const { error } = await sb.from("felt_surveys")
    .upsert({ city_id: cityId, user_id: userId, ...surveyToRow(survey), updated_at: new Date().toISOString() },
            { onConflict: "city_id,user_id" });
  if (error) throw error;
}

// ── Baseline ratings (per-user) ──────────────────────────────────────────────
export async function fetchMyBaselines(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from("baseline_ratings").select("*").eq("user_id", userId);
  if (error) throw error;
  const byPlace = {};
  for (const r of data || []) byPlace[r.place_name] = rowToSurvey(r);
  return byPlace;
}

export async function upsertBaseline(userId, placeName, survey) {
  const sb = getSupabase();
  const { error } = await sb.from("baseline_ratings")
    .upsert({ user_id: userId, place_name: placeName, ...surveyToRow(survey), updated_at: new Date().toISOString() },
            { onConflict: "user_id,place_name" });
  if (error) throw error;
}

// ── Weights (per-user) ───────────────────────────────────────────────────────
export async function fetchMyWeights(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from("user_weights").select("weights").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.weights || null;
}

export async function upsertWeights(userId, weights) {
  const sb = getSupabase();
  const { error } = await sb.from("user_weights").upsert({ user_id: userId, weights }, { onConflict: "user_id" });
  if (error) throw error;
}
