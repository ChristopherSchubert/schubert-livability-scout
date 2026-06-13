// nearestCities — the Plan-tab suggestion ranking. Guards: nearest-first order,
// the maxKm cutoff, the limit cap, multi-anchor min-distance (a multi-region
// trip surfaces cities near EITHER anchor, not a centroid between them), and
// the empty-anchor contract (returns [] so the caller owns the fallback).
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestCities } from "../lib/trip-window.js";

// A spread of cities. Hudson Valley ~ (41.7, -73.9); Vermont ~ (44.1, -72.7).
const CITIES = [
  { id: "cold-spring-ny", name: "Cold Spring", lat: 41.42, lon: -73.95 },
  { id: "rhinebeck-ny", name: "Rhinebeck", lat: 41.93, lon: -73.91 },
  { id: "camden-me", name: "Camden", lat: 44.21, lon: -69.06 },
  { id: "astoria-or", name: "Astoria", lat: 46.19, lon: -123.83 }, // far west
  { id: "no-coords", name: "Ghost", lat: null, lon: null },        // unmeasured
];

const HUDSON = { lat: 41.7, lon: -73.9 };
const VERMONT = { lat: 44.06, lon: -72.71 };

test("ranks nearest-first and drops the far-away + coordless", () => {
  const out = nearestCities(CITIES, [HUDSON]);
  const ids = out.map((c) => c.id);
  assert.deepEqual(ids, ["rhinebeck-ny", "cold-spring-ny"]);
  // Astoria (>3000km) past the 400km cutoff; Camden too; Ghost has no coords.
});

test("multi-anchor uses min distance to ANY anchor, not a centroid", () => {
  // With Hudson + Vermont anchors, Camden (near Vermont) now qualifies.
  const out = nearestCities(CITIES, [HUDSON, VERMONT]);
  const ids = out.map((c) => c.id);
  assert.ok(ids.includes("camden-me"), "Camden is within 400km of Vermont");
  assert.ok(ids.includes("cold-spring-ny"));
  assert.ok(!ids.includes("astoria-or"));
});

test("respects the limit cap", () => {
  const out = nearestCities(CITIES, [HUDSON, VERMONT], { limit: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "rhinebeck-ny"); // closest overall (to the Hudson anchor)
});

test("empty / coordless anchors return [] (caller owns the fallback)", () => {
  assert.deepEqual(nearestCities(CITIES, []), []);
  assert.deepEqual(nearestCities(CITIES, [{ lat: null, lon: null }]), []);
  assert.deepEqual(nearestCities(CITIES, null), []);
});

test("custom maxKm widens the net", () => {
  const out = nearestCities(CITIES, [HUDSON], { maxKm: 100000 });
  assert.ok(out.map((c) => c.id).includes("astoria-or"));
});
