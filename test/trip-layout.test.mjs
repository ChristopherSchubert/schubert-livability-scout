// Unit tests for layOutLegPlan — the pure dealer in lib/trip.js.
// Cases: fits-around-existing, over-supply→alternates, empty-bucket, single-day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { layOutLegPlan } from "../lib/trip.js";

const LEG = { arrive: "2026-06-01", depart: "2026-06-04" };
const DAYS = [
  { date: "2026-06-01", cityId: "x", legName: "X" },
  { date: "2026-06-02", cityId: "x", legName: "X" },
  { date: "2026-06-03", cityId: "x", legName: "X" },
  { date: "2026-06-04", cityId: "x", legName: "X" },
];
const makeItems = (n) => Array.from({ length: n }, (_, i) => ({ id: `item-${i}` }));

test("empty bucket → no placements, no alternates", () => {
  const { placements, alternates } = layOutLegPlan(LEG, DAYS, [], {});
  assert.deepEqual(placements, []);
  assert.deepEqual(alternates, []);
});

test("single-day leg: items fill until ceiling, rest become alternates", () => {
  const leg = { arrive: "2026-06-01", depart: "2026-06-01" };
  const days = [{ date: "2026-06-01", cityId: "x", legName: "X" }];
  // arrive-day cap = 2 (DAY_CAP_EDGE)
  const bucket = makeItems(4);
  const { placements, alternates } = layOutLegPlan(leg, days, bucket, {});
  assert.equal(placements.length, 2, "two fit on the edge day");
  assert.equal(alternates.length, 2, "two overflow to alternates");
  assert.ok(placements.every((p) => p.day === "2026-06-01"));
});

test("fits around existing items — empties-first distribution", () => {
  // Middle days already have 3 items each; arrive/depart have 0 but cap 2.
  // 4 bucket items to place.
  const byDay = {
    "2026-06-02": [1, 2, 3].map((n) => ({ id: `e${n}` })), // 3 placed
    "2026-06-03": [4, 5, 6].map((n) => ({ id: `e${n}` })), // 3 placed
  };
  const bucket = makeItems(4);
  const { placements, alternates } = layOutLegPlan(LEG, DAYS, bucket, byDay);
  // arrive (06-01) and depart (06-04) each take 2 → 4 total fit
  assert.equal(placements.length, 4);
  assert.equal(alternates.length, 0);
  const daySet = new Set(placements.map((p) => p.day));
  assert.ok(daySet.has("2026-06-01"), "arrive day used");
  assert.ok(daySet.has("2026-06-04"), "depart day used");
  // Middle days were already at 3 (normal cap 4) so they absorb 1 each too
});

test("over-supply — excess items go to alternates, not placed", () => {
  // 4 days; arrive/depart cap 2 each, middle days cap 4 each → total capacity:
  //   06-01: cap 2, 06-02: cap 4, 06-03: cap 4, 06-04: cap 2 → 12
  // Send 15 items; 3 must overflow.
  const bucket = makeItems(15);
  const { placements, alternates } = layOutLegPlan(LEG, DAYS, bucket, {});
  assert.equal(placements.length, 12);
  assert.equal(alternates.length, 3);
  // Every placed item has a real date that is in DAYS
  const validDates = new Set(DAYS.map((d) => d.date));
  assert.ok(placements.every((p) => validDates.has(p.day)));
});

test("all returned entryIds correspond to bucket item ids", () => {
  const bucket = makeItems(6);
  const { placements, alternates } = layOutLegPlan(LEG, DAYS, bucket, {});
  const placed = new Set(placements.map((p) => p.entryId));
  const alt = new Set(alternates);
  // No overlap
  for (const id of placed) assert.ok(!alt.has(id), `${id} both placed and alternate`);
  // Full coverage: every bucket item is either placed or alternate
  for (const item of bucket) {
    assert.ok(placed.has(item.id) || alt.has(item.id), `${item.id} missing`);
  }
});

test("missing / null arguments → empty result (no throw)", () => {
  assert.doesNotThrow(() => layOutLegPlan(null, DAYS, makeItems(3), {}));
  assert.doesNotThrow(() => layOutLegPlan(LEG, [], makeItems(3), {}));
  assert.doesNotThrow(() => layOutLegPlan(LEG, DAYS, null, {}));
  const r = layOutLegPlan(null, DAYS, makeItems(3), {});
  assert.deepEqual(r.placements, []);
  assert.deepEqual(r.alternates, []);
});
