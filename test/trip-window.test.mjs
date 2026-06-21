// Trip-window leg-shift math (#22). Guards the drag's riskiest logic — the day
// arithmetic + the clamp that keeps any leg from vanishing — without a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, legBoundaries, clampShift, shiftLegBoundary, resizeTripStart, resizeTripEnd } from "../lib/trip-window.js";

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

test("resizeTripStart: -1 starts a day earlier (first leg grows), +1 a day later", () => {
  const earlier = resizeTripStart("2026-05-15", LEGS, -1);
  assert.equal(earlier.startDate, "2026-05-14");
  assert.equal(earlier.legs[0].arrive, "2026-05-14"); // Ljubljana 2n → 3n
  assert.equal(earlier.legs[1].arrive, "2026-05-17"); // others untouched

  const later = resizeTripStart("2026-05-15", LEGS, 1);
  assert.equal(later.startDate, "2026-05-16");
  assert.equal(later.legs[0].arrive, "2026-05-16"); // Ljubljana 2n → 1n
});

test("resizeTripEnd: +1 ends a day later (last leg grows), -1 a day earlier", () => {
  const later = resizeTripEnd("2026-05-25", LEGS, 1);
  assert.equal(later.endDate, "2026-05-26");
  assert.equal(later.legs[2].depart, "2026-05-26"); // Piran 5n → 6n

  const earlier = resizeTripEnd("2026-05-25", LEGS, -1);
  assert.equal(earlier.endDate, "2026-05-24");
  assert.equal(earlier.legs[2].depart, "2026-05-24"); // Piran 5n → 4n
});

test("resize floors: can't shorten an edge leg below one day", () => {
  const oneDayFirst = [{ name: "A", arrive: "2026-05-15", depart: "2026-05-15" }, LEGS[1], LEGS[2]];
  assert.equal(resizeTripStart("2026-05-15", oneDayFirst, 1), null); // start-later would erase leg A
  const oneDayLast = [LEGS[0], LEGS[1], { name: "Z", arrive: "2026-05-21", depart: "2026-05-21" }];
  assert.equal(resizeTripEnd("2026-05-21", oneDayLast, -1), null);   // end-earlier would erase leg Z
});
