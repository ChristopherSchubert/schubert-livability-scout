// Trip-window leg-shift math (#22). Guards the drag's riskiest logic — the day
// arithmetic + the clamp that keeps any leg from vanishing — without a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, legBoundaries, clampShift, shiftLegBoundary } from "../lib/trip-window.js";

// The real Slovenia legs: Ljubljana 2n, Bled 4n, Piran 5n, all date-adjacent.
const LEGS = [
  { name: "Ljubljana", arrive: "2026-05-15", depart: "2026-05-16" },
  { name: "Bled", arrive: "2026-05-17", depart: "2026-05-20" },
  { name: "Piran", arrive: "2026-05-21", depart: "2026-05-25" },
];

test("addDays / daysBetween: month-crossing arithmetic", () => {
  assert.equal(addDays("2026-05-31", 1), "2026-06-01");
  assert.equal(addDays("2026-06-01", -1), "2026-05-31");
  assert.equal(daysBetween("2026-05-15", "2026-05-16"), 1);
  assert.equal(daysBetween("2026-05-31", "2026-06-02"), 2);
});

test("legBoundaries: only date-adjacent legs get a boundary", () => {
  assert.deepEqual(legBoundaries(LEGS), [0, 1]);
  // a gap (Bled departs 20, Piran arrives 22) breaks the boundary
  const gapped = [LEGS[0], LEGS[1], { ...LEGS[2], arrive: "2026-05-22" }];
  assert.deepEqual(legBoundaries(gapped), [0]);
});

test("shiftLegBoundary: +1 grows the left leg, takes a day from the right", () => {
  const { legs, shift } = shiftLegBoundary(LEGS, 0, 1);
  assert.equal(shift, 1);
  assert.equal(legs[0].depart, "2026-05-17"); // Ljubljana now 3n
  assert.equal(legs[1].arrive, "2026-05-18"); // Bled now 3n
  assert.equal(legs[2].arrive, "2026-05-21"); // Piran untouched
});

test("shiftLegBoundary: -1 shrinks the left leg, gives a day to the right", () => {
  const { legs, shift } = shiftLegBoundary(LEGS, 0, -1);
  assert.equal(shift, -1);
  assert.equal(legs[0].depart, "2026-05-15"); // Ljubljana now 1n
  assert.equal(legs[1].arrive, "2026-05-16"); // Bled now 5n
});

test("clamp: a leg can never drop below one day", () => {
  // Ljubljana is 2 days → can give at most 1 day left (floor at 1n).
  assert.equal(clampShift(LEGS, 0, -5), -1);
  // Bled is 4 days → boundary 0 can grow Ljubljana by up to 3 (Bled floor 1n).
  assert.equal(clampShift(LEGS, 0, 99), 3);
  // The shift result reflects the clamp, not the raw request.
  assert.equal(shiftLegBoundary(LEGS, 0, -5).legs[0].depart, "2026-05-15");
  assert.equal(shiftLegBoundary(LEGS, 0, -5).shift, -1);
});

test("non-adjacent or out-of-range boundary is a no-op", () => {
  const gapped = [LEGS[0], { ...LEGS[1], arrive: "2026-05-18" }]; // gap 16→18
  assert.equal(clampShift(gapped, 0, 1), 0);
  const { legs, shift } = shiftLegBoundary(LEGS, 9, 1);
  assert.equal(shift, 0);
  assert.equal(legs, LEGS); // unchanged array returned
});
