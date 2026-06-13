"use client";

// Runtime data-access layer over Supabase. Cities are shared; felt surveys,
// baseline ratings, and weights are per-user. All reads/writes go through the
// browser client (gated by RLS).
import { getSupabase } from "./supabase.js";
import { rowToCity, cityToRow } from "./city-row.js";
import { rowToTrip, tripToRow } from "./trip.js";
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
    blocks: "blocks", blockGeometries: "block_geometries", blockBlurbs: "block_blurbs", poiPositions: "poi_positions", walkingCoreCenter: "walking_core_center", nearbyFeature: "nearby_feature", status: "status", decision: "decision", isCalibration: "is_calibration", heroImage: "hero_image",
    arriveDate: "arrive_date", departDate: "depart_date", tripLength: "trip_length",
    flightDetails: "flight_details", carDetails: "car_details", lodgingDetails: "lodging_details",
    logisticsNotes: "logistics_notes", itinerary: "itinerary", days: "days", checklists: "checklists",
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

// ── Journal entries (per-user, a log: many per city) ─────────────────────────
function rowToJournalEntry(r) {
  return {
    id: r.id, body: r.body || "", reaction: r.reaction || "", atPlace: r.at_place || "",
    createdAt: r.created_at || null, updatedAt: r.updated_at || null,
  };
}

// This user's journal, keyed city_id -> [entry, …] newest first.
export async function fetchMyJournal(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from("journal_entries")
    .select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  const byCity = {};
  for (const r of data || []) (byCity[r.city_id] ||= []).push(rowToJournalEntry(r));
  return byCity;
}

// Insert a new entry; returns the saved row (with its server id + timestamps).
export async function insertJournalEntry(cityId, userId, fields) {
  const sb = getSupabase();
  const { data, error } = await sb.from("journal_entries")
    .insert({ city_id: cityId, user_id: userId, body: fields.body || "",
              reaction: fields.reaction || null, at_place: fields.atPlace || null })
    .select("*").single();
  if (error) throw error;
  return rowToJournalEntry(data);
}

export async function updateJournalEntry(id, fields) {
  const sb = getSupabase();
  const patch = { updated_at: new Date().toISOString() };
  if (fields.body !== undefined) patch.body = fields.body;
  if (fields.reaction !== undefined) patch.reaction = fields.reaction || null;
  if (fields.atPlace !== undefined) patch.at_place = fields.atPlace || null;
  const { error } = await sb.from("journal_entries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteJournalEntry(id) {
  const sb = getSupabase();
  const { error } = await sb.from("journal_entries").delete().eq("id", id);
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

// ── Trips (per-user, real-time) ──────────────────────────────────────────────
// The trip FRAME (name/dates/legs/glance/travelers/passes) lives on the `trips`
// row; ENTRIES are one-row-per-entry in `trip_entries` (migration 0016) so
// co-editing patches a single entry, not the whole array. Frame patches go
// through TRIP_COL (the mapPatch discipline); entry patches write trip_entries.

// camelCase frame patch → just the snake columns it touches. `entries` is NOT
// writable here — entries are rows in trip_entries (use upsertEntry/deleteEntry).
const TRIP_COL = {
  name: "name", theme: "theme", startDate: "start_date", endDate: "end_date",
  glance: "glance", preTrip: "pre_trip", legs: "legs", options: "options",
  travelers: "travelers", passes: "passes",
};
function tripPatchToRow(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!TRIP_COL[k]) continue;
    out[TRIP_COL[k]] = v === undefined ? null : v;
  }
  out.updated_at = new Date().toISOString();
  return out;
}

// trip_entries row ⇄ app entry. Columns id/day/sort are promoted out of the
// jsonb payload for indexing/ordering; everything else is the v2 atom.
function entryToRow(tripId, entry) {
  const { id, day, sort, ...payload } = entry;
  const row = { trip_id: tripId, day: day || null, sort: sort ?? 0, payload, updated_at: new Date().toISOString() };
  if (id) row.id = id;
  return row;
}
function rowToEntry(r) {
  const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : (r.day || null);
  return { id: r.id, day, sort: r.sort ?? 0, ...(r.payload || {}) };
}

export async function fetchMyTrips(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from("trips").select("*").eq("user_id", userId).order("start_date", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToTrip);
}

// A trip's frame + its entries (hydrated from trip_entries, overwriting the
// legacy blob). Ready for the lib/trip.js derived helpers.
export async function fetchTrip(id) {
  const sb = getSupabase();
  const { data: row, error } = await sb.from("trips").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: entryRows, error: eErr } = await sb
    .from("trip_entries").select("*").eq("trip_id", id)
    .order("day", { ascending: true }).order("sort", { ascending: true });
  if (eErr) throw eErr;
  const trip = rowToTrip(row);
  trip.entries = (entryRows || []).map(rowToEntry);
  return trip;
}

export async function insertTrip(trip) {
  const sb = getSupabase();
  const { data, error } = await sb.from("trips").insert(tripToRow(trip)).select().single();
  if (error) throw error;
  return rowToTrip(data);
}

export async function updateTrip(id, patch) {
  const sb = getSupabase();
  const { error } = await sb.from("trips").update(tripPatchToRow(patch)).eq("id", id);
  if (error) throw error;
}

export async function deleteTrip(id) {
  const sb = getSupabase();
  const { error } = await sb.from("trips").delete().eq("id", id); // trip_entries cascade
  if (error) throw error;
}

// Insert (new id) or update (existing id) a single entry. Returns the hydrated
// entry (with its id) so the caller can adopt a server-generated id.
export async function upsertEntry(tripId, entry) {
  const sb = getSupabase();
  const row = entryToRow(tripId, entry);
  const q = row.id
    ? sb.from("trip_entries").upsert(row, { onConflict: "id" })
    : sb.from("trip_entries").insert(row);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return rowToEntry(data);
}

export async function deleteEntry(entryId) {
  const sb = getSupabase();
  const { error } = await sb.from("trip_entries").delete().eq("id", entryId);
  if (error) throw error;
}

// Persist a manual within-day order: ids in their new order → sort = index.
export async function reorderEntries(tripId, day, ids) {
  const sb = getSupabase();
  const stamp = new Date().toISOString();
  await Promise.all(ids.map((id, i) =>
    sb.from("trip_entries").update({ sort: i, updated_at: stamp }).eq("id", id).eq("trip_id", tripId)
  ));
}

// Real-time: a Supabase channel scoped to this trip's entries (and its frame
// row). `onChange({ table, eventType, entry?, trip? })` fires per change.
// Returns an unsubscribe fn.
export function subscribeTrip(id, onChange) {
  const sb = getSupabase();
  const channel = sb.channel(`trip:${id}`)
    .on("postgres_changes",
        { event: "*", schema: "public", table: "trip_entries", filter: `trip_id=eq.${id}` },
        (p) => onChange({
          table: "trip_entries", eventType: p.eventType,
          entry: p.new && Object.keys(p.new).length ? rowToEntry(p.new) : null,
          oldId: p.old?.id ?? null,
        }))
    .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${id}` },
        (p) => onChange({ table: "trips", eventType: p.eventType, trip: rowToTrip(p.new) }))
    .subscribe();
  return () => { sb.removeChannel(channel); };
}
