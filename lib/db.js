"use client";

// Runtime data-access layer over Supabase. Cities are shared; felt surveys,
// baseline ratings, and weights are per-user. All reads/writes go through the
// browser client (gated by RLS).
import { getSupabase } from "./supabase.js";
import { rowToCity, cityToRow } from "./city-row.js";
import { rowToTrip, tripToRow, rowToEntry, entryToRow, tripPatchToRow } from "./trip.js";
import { emptySurvey } from "./planner-data.js";

const SURVEY_COLS = [
  "setting",
  "aliveness",
  "fabric",
  "realness",
  "january",
  "slovenia",
  "note",
  "context",
  "taken_at",
];

function surveyToRow(s) {
  return {
    setting: s.setting,
    aliveness: s.aliveness,
    fabric: s.fabric,
    realness: s.realness,
    january: s.january,
    slovenia: s.slovenia,
    note: s.note || "",
    context: s.context || "",
    taken_at: s.takenAt || null,
  };
}
function rowToSurvey(r) {
  if (!r) return emptySurvey();
  return {
    setting: r.setting,
    aliveness: r.aliveness,
    fabric: r.fabric,
    realness: r.realness,
    january: r.january,
    slovenia: r.slovenia,
    note: r.note || "",
    context: r.context || "",
    takenAt: r.taken_at || "",
  };
}

// ── Cities (shared) ────────────────────────────────────────────────────────
export async function fetchCities() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("cities")
    .select("*")
    .order("created_at", { ascending: true });
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
    name: "name",
    stayZone: "stay_zone",
    heartIntersection: "heart_intersection",
    tripWeek: "trip_week",
    why: "why",
    blocks: "blocks",
    blockGeometries: "block_geometries",
    blockBlurbs: "block_blurbs",
    poiPositions: "poi_positions",
    status: "status",
    decision: "decision",
    isCalibration: "is_calibration",
    heroImage: "hero_image",
    arriveDate: "arrive_date",
    departDate: "depart_date",
    tripLength: "trip_length",
    flightDetails: "flight_details",
    carDetails: "car_details",
    lodgingDetails: "lodging_details",
    logisticsNotes: "logistics_notes",
    itinerary: "itinerary",
    days: "days",
    checklists: "checklists",
    measuredMetrics: "measured_metrics",
    waterTarget: "water_target",
    stayZoneBoundary: "stay_zone_boundary",
    horizonFeatures: "horizon_features",
    lat: "lat",
    lon: "lon",
    visitClimate: "visit_climate",
    crowdSeason: "crowd_season",
    crowdIntensity: "crowd_intensity",
    npsUnitCode: "nps_unit_code",
    seasonNotes: "season_notes",
    driveHrsFromPit: "drive_hrs_from_pit",
    planningOrder: "planning_order",
  };
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!M[k]) continue;
    if (k === "driveHrsFromPit") {
      // Text column; encode number → string, keep "FLY" / null as-is.
      out[M[k]] = v == null ? null : v === "FLY" ? "FLY" : String(v);
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
  const { error } = await sb.from("felt_surveys").upsert(
    {
      city_id: cityId,
      user_id: userId,
      ...surveyToRow(survey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "city_id,user_id" }
  );
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
  const { error } = await sb.from("baseline_ratings").upsert(
    {
      user_id: userId,
      place_name: placeName,
      ...surveyToRow(survey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,place_name" }
  );
  if (error) throw error;
}

// ── Weights (per-user) ───────────────────────────────────────────────────────
export async function fetchMyWeights(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("user_weights")
    .select("weights")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.weights || null;
}

export async function upsertWeights(userId, weights) {
  const sb = getSupabase();
  const { error } = await sb
    .from("user_weights")
    .upsert({ user_id: userId, weights }, { onConflict: "user_id" });
  if (error) throw error;
}

// ── POIs (shared cache, read) — the Gather pool source ───────────────────────
// Pull cached Google-Places POIs within a bounding box around a pin, for
// lib/sourcing.js#buildPool (issue #25). Read-only; the cache is populated by
// the measurement pipeline (scripts/.fetch-pois.mjs).
export async function fetchPoisNear(lat, lon, radiusM = 1500) {
  const sb = getSupabase();
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const { data, error } = await sb
    .from("pois")
    .select("*")
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lon", lon - dLon)
    .lte("lon", lon + dLon)
    .limit(400);
  if (error) throw error;
  return data || [];
}

// ── Trips (per-user, real-time) ──────────────────────────────────────────────
// The Trip Planner's data surface (issue #11). Entries are NORMALIZED into the
// trip_entries table (migration 0016): fetchTrip hydrates them onto the trip
// object, and entry-level writes go to that table (not the deprecated blob) so
// real-time co-editing gets per-entry patches. lib/db.js stays the sole
// getSupabase() caller; the round-trip lives in lib/trip.js.

// Trip frames only (no entries) — for the /trips index.
export async function fetchMyTrips(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trips")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToTrip);
}

// A single trip: the frame + its trip_entries, hydrated into a v2 trip object
// ready for the lib/trip.js helpers. Entries sort by (day, sort).
export async function fetchTrip(id) {
  const sb = getSupabase();
  const { data: row, error } = await sb.from("trips").select("*").eq("id", id).single();
  if (error) throw error;
  const trip = rowToTrip(row);
  const { data: entries, error: e2 } = await sb
    .from("trip_entries")
    .select("*")
    .eq("trip_id", id)
    .order("day", { ascending: true })
    .order("sort", { ascending: true });
  if (e2) throw e2;
  trip.entries = (entries || []).map(rowToEntry);
  return trip;
}

export async function insertTrip(trip) {
  const sb = getSupabase();
  const { data, error } = await sb.from("trips").insert(tripToRow(trip)).select().single();
  if (error) throw error;
  return rowToTrip(data);
}

// Partial trip-FRAME patch. tripPatchToRow (lib/trip.js, pure + tested #42)
// keeps only known frame columns — unknown keys dropped, not thrown; `entries`
// is intentionally unmappable (entries live in trip_entries).
export async function updateTrip(id, patch) {
  const sb = getSupabase();
  const mapped = tripPatchToRow(patch);
  mapped.updated_at = new Date().toISOString();
  const { error } = await sb.from("trips").update(mapped).eq("id", id);
  if (error) throw error;
}

export async function deleteTrip(id) {
  const sb = getSupabase();
  const { error } = await sb.from("trips").delete().eq("id", id);
  if (error) throw error;
}

// Entry-level writes target trip_entries (the whole point of the normalization).
export async function upsertEntry(tripId, entry) {
  const sb = getSupabase();
  const row = entryToRow(tripId, entry);
  row.updated_at = new Date().toISOString();
  const { data, error } = await sb.from("trip_entries").upsert(row).select().single();
  if (error) throw error;
  return rowToEntry(data);
}

export async function deleteEntry(entryId) {
  const sb = getSupabase();
  const { error } = await sb.from("trip_entries").delete().eq("id", entryId);
  if (error) throw error;
}

// Persist a new within-day order (the drag result). Touches only `sort` per row
// so a reorder never clobbers an entry's payload (a partial upsert can't, since
// payload is NOT NULL) — one cheap update per id.
export async function reorderEntries(tripId, day, ids) {
  const sb = getSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await sb
      .from("trip_entries")
      .update({ sort: i, day, updated_at: new Date().toISOString() })
      .eq("id", ids[i])
      .eq("trip_id", tripId);
    if (error) throw error;
  }
}

// Real-time subscription on this trip's entries (+ the frame row). `onChange`
// receives { table, eventType, entry?, trip?, id? } so the provider can merge
// (issue #12). Returns an unsubscribe fn. RLS still scopes what a client sees.
export function subscribeTrip(id, onChange) {
  const sb = getSupabase();
  const channel = sb
    .channel(`trip:${id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_entries", filter: `trip_id=eq.${id}` },
      (payload) => {
        const rec = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
        onChange({
          table: "trip_entries",
          eventType: payload.eventType,
          entry: rec && payload.eventType !== "DELETE" ? rowToEntry(rec) : null,
          id: rec?.id ?? null,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trips", filter: `id=eq.${id}` },
      (payload) =>
        onChange({
          table: "trips",
          eventType: payload.eventType,
          trip: payload.new ? rowToTrip(payload.new) : null,
        })
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
