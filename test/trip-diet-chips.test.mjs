// Unit tests for tripDietChips + mealVegState (dietary screening helpers).
// Covers the four cases specified in the task brief. node:test, zero deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tripDietChips, mealVegState } from "../lib/trip.js";

// ── tripDietChips ──────────────────────────────────────────────────────────

test("tripDietChips: no travelers → empty array", () => {
  assert.deepEqual(tripDietChips({}), []);
  assert.deepEqual(tripDietChips({ travelers: [] }), []);
});

test("tripDietChips: non-diet chips ignored; veg returned", () => {
  const trip = {
    travelers: [
      { name: "Chris", kind: "person", chips: ["kid", "veg"] },
      { name: "Janice", kind: "person", chips: ["limited mobility"] },
    ],
  };
  assert.deepEqual(tripDietChips(trip), ["veg"]);
});

test("tripDietChips: de-dupes across travelers", () => {
  const trip = {
    travelers: [
      { name: "A", kind: "person", chips: ["veg"] },
      { name: "B", kind: "person", chips: ["veg", "vegan"] },
    ],
  };
  const result = tripDietChips(trip);
  assert.equal(result.length, 2);
  assert.ok(result.includes("veg"));
  assert.ok(result.includes("vegan"));
});

test("tripDietChips: travelers with no chips field are safe", () => {
  const trip = { travelers: [{ name: "Ghost", kind: "person" }] };
  assert.deepEqual(tripDietChips(trip), []);
});

// ── mealVegState ───────────────────────────────────────────────────────────

test("mealVegState: no dietChips → null regardless of entry", () => {
  const entry = { category: "meal", markers: [{ type: "veg", source: "Google Places" }] };
  assert.equal(mealVegState(entry, []), null);
  assert.equal(mealVegState(entry, null), null);
});

test("mealVegState: meal with veg marker + veg chip → 'ok'", () => {
  const entry = { category: "meal", markers: [{ type: "veg", source: "Google Places · 2026-05-01" }] };
  assert.equal(mealVegState(entry, ["veg"]), "ok");
});

test("mealVegState: meal without veg marker + veg chip → 'unverified'", () => {
  const entry = { category: "meal", markers: [] };
  assert.equal(mealVegState(entry, ["veg"]), "unverified");
});

test("mealVegState: meal with no markers field + veg chip → 'unverified'", () => {
  const entry = { category: "meal" };
  assert.equal(mealVegState(entry, ["veg"]), "unverified");
});

test("mealVegState: non-meal category + veg chip → null", () => {
  assert.equal(mealVegState({ category: "activity", markers: [{ type: "veg" }] }, ["veg"]), null);
  assert.equal(mealVegState({ category: "stay", markers: [] }, ["veg"]), null);
  assert.equal(mealVegState({ category: "travel", markers: [] }, ["veg"]), null);
});

test("mealVegState: vegan chip also triggers screening", () => {
  const entry = { category: "meal", markers: [] };
  assert.equal(mealVegState(entry, ["vegan"]), "unverified");
});
