// Smoke tests for the image/search-query builders (#42, guarding the #47
// split). These exercise the functions — not just import them — because the
// escapeRegExp coupling bug only surfaced at call time, not load time. Run via
// the barrel (lib/planner-data.js) so they pass wherever the code lives.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  cityImageQuery,
  blockImageQuery,
  cityZones,
  imageResearchBrief,
  testSpotBrief,
  starterCities,
  CITY_IMAGE_QUERY_OVERRIDES,
} from "../lib/planner-data.js";

test("slugify: kebab-cases and strips punctuation", () => {
  assert.equal(slugify("Santa Barbara, CA"), "santa-barbara-ca");
});

test("CITY_IMAGE_QUERY_OVERRIDES re-exported through the barrel", () => {
  assert.ok(CITY_IMAGE_QUERY_OVERRIDES && typeof CITY_IMAGE_QUERY_OVERRIDES === "object");
});

test("starter cities seed their image fields at module init (city factory path)", () => {
  const c = starterCities[0];
  assert.ok(c.heroImage, "heroImage should be auto-seeded");
  assert.ok(c.stayZoneImage, "stayZoneImage should be auto-seeded");
});

test("blockImageQuery routes through the landmark matcher (escapeRegExp) without throwing", () => {
  const c = starterCities[0];
  // a block that contains a landmark name exercises landmarkSearchSubject → escapeRegExp
  const q = blockImageQuery(c.name, c.blocks[0]);
  assert.ok(typeof q === "string" && q.length > 0);
});

test("cityZones / imageResearchBrief / testSpotBrief run end to end", () => {
  const c = starterCities[0];
  assert.ok(Array.isArray(cityZones(c)));
  assert.ok(typeof imageResearchBrief(c, "hero") === "object");
  assert.ok(typeof testSpotBrief(c, c.blocks[0]) === "object");
});

test("cityImageQuery honours overrides when present", () => {
  // pick any overridden city and confirm the query reflects the override
  const [name, override] = Object.entries(CITY_IMAGE_QUERY_OVERRIDES)[0];
  assert.equal(cityImageQuery(name), override);
});
