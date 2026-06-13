// placeableStops — unit tests for the shared Map/Frame split (#8).
// Guards that Frame and Map use identical logic and never disagree on counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeableStops } from "../lib/trip-frame.js";

const PIN = { lat: 46.36, lon: 14.09 };

test("placeableStops: all pinned → unpinnedCount is 0", () => {
  const trip = {
    entries: [
      { id: "a", category: "activity", place: { ...PIN } },
      { id: "b", category: "meal",     place: { ...PIN } },
    ],
  };
  const { placed, placeableCount, unpinnedCount } = placeableStops(trip);
  assert.equal(placeableCount, 2);
  assert.equal(placed.length, 2);
  assert.equal(unpinnedCount, 0);
});

test("placeableStops: none pinned → placed is empty, unpinnedCount equals placeableCount", () => {
  const trip = {
    entries: [
      { id: "a", category: "activity" },
      { id: "b", category: "meal" },
    ],
  };
  const { placed, placeableCount, unpinnedCount } = placeableStops(trip);
  assert.equal(placeableCount, 2);
  assert.equal(placed.length, 0);
  assert.equal(unpinnedCount, 2);
});

test("placeableStops: mixed pinned/unpinned counts are honest", () => {
  const trip = {
    entries: [
      { id: "a", category: "activity", place: { ...PIN } }, // placed
      { id: "b", category: "meal" },                         // unpinned (no place)
      { id: "c", category: "activity", place: { lat: null, lon: null } }, // unpinned (null coords)
      { id: "d", category: "stay", place: { ...PIN } },      // NOT placeable (stay)
      { id: "e", category: "travel" },                        // NOT placeable (travel)
    ],
  };
  const { placed, placeableCount, unpinnedCount } = placeableStops(trip);
  assert.equal(placeableCount, 3);   // a + b + c (stays/travel excluded)
  assert.equal(placed.length, 1);    // only a has real coords
  assert.equal(unpinnedCount, 2);    // b + c
});

test("placeableStops: empty trip yields all zeros", () => {
  const { placed, placeableCount, unpinnedCount } = placeableStops({ entries: [] });
  assert.equal(placeableCount, 0);
  assert.equal(placed.length, 0);
  assert.equal(unpinnedCount, 0);
});

test("placeableStops: no entries key → no crash", () => {
  const { placed, placeableCount, unpinnedCount } = placeableStops({});
  assert.equal(placeableCount, 0);
  assert.equal(unpinnedCount, 0);
  assert.deepEqual(placed, []);
});

test("placeableStops: placed entries are the exact entry objects (reference equality)", () => {
  const entry = { id: "x", category: "meal", place: { ...PIN } };
  const { placed } = placeableStops({ entries: [entry] });
  assert.strictEqual(placed[0], entry);
});
