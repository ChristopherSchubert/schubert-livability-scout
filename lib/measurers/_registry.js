// lib/measurers/_registry.js — the measurer contract and the registry array.
//
// A measurer is a tiny declarative module:
//
//   export default {
//     id: "climate",              // unique key for --measurer selection
//     describe: "NOAA monthly normals + freeze/clear days + extremes",
//     needs: ["lat", "lon"],      // fields required from the city row
//     // What this measurer writes — used by --force and --missing-only to
//     // decide whether to skip a city that already has every output:
//     writes: {
//       measuredMetrics: ["climate_extremes"],
//       columns: ["visit_climate"],
//     },
//     throttleMs: 1200,           // sleep after run() to respect upstream limits
//     async run({ lat, lon, asOf, prior, env }) {
//       // prior = the city's current measuredMetrics (read-only)
//       // env  = process.env (so the measurer can opt into local OSM, etc.)
//       return {
//         measuredMetrics: { ... envelope per key ... },   // optional
//         visitClimate:    [...],                          // optional
//         columns:         { population: 12345 },          // optional
//         notes:           "string for the per-city log",  // optional
//       };
//     },
//   };
//
// Every value written into measuredMetrics MUST be wrapped in the canonical
// envelope: { value, asOf, source, sourceUrl, meta? }. Don't store bare scalars.

export function envelope({ value, asOf, source, sourceUrl, meta }) {
  if (value == null) return null;
  const env = { value, asOf, source };
  if (sourceUrl) env.sourceUrl = sourceUrl;
  if (meta) env.meta = meta;
  return env;
}

// The order here matters only for the per-city log; the runner respects
// `needs` for actual dependency ordering. Geographic + climate first because
// they're the slowest, so failures surface early.
import climate from "./climate.js";
import snowfall from "./snowfall.js";
import water from "./water.js";
import osmContext from "./osm-context.js";
import terrain from "./terrain.js";
import horizon from "./horizon.js";
import admin from "./admin.js";
import blocks from "./blocks.js";

export const REGISTRY = [
  climate,
  snowfall,
  water,
  osmContext,
  terrain,
  horizon,
  admin,
  blocks,
];

export function pickMeasurers(selection) {
  if (!selection || selection === "all") return REGISTRY;
  const wanted = new Set(selection.split(",").map((s) => s.trim()).filter(Boolean));
  const picked = REGISTRY.filter((m) => wanted.has(m.id));
  const missing = [...wanted].filter((id) => !picked.some((m) => m.id === id));
  if (missing.length) {
    throw new Error(`unknown measurer(s): ${missing.join(", ")}. known: ${REGISTRY.map((m) => m.id).join(", ")}`);
  }
  return picked;
}
