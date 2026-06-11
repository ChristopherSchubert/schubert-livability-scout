// lib/planner-data.js — thin barrel (the former "godfile"). After the #47
// split, the domain logic lives in focused, isomorphic modules; this file just
// re-exports them so every existing `from "lib/planner-data"` import keeps
// working unchanged. Add new domain code to the relevant module, not here.
export const STORAGE_KEY = "city-trial-planner-v1";

export * from "./image-queries.js"; // image/search-query builders + CITY_IMAGE_QUERY_OVERRIDES
export * from "./stages.js";        // funnel stages + cityStage
export * from "./metrics.js";       // measured taxonomy, scoring bands, axis rollups, learned weights
export * from "./visit-window.js";  // climate / visit-window logic
export * from "./survey.js";        // felt-score questionnaire
export * from "./city-factory.js";  // city() factory, starterCities seed, normalizeState, defaultState
