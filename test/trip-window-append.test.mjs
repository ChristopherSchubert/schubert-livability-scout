// appendCityLeg — guards the leg-append math: shaves the longest leg, preserves
// the span, never reduces any leg below 1 night, handles the empty-trip case.
//
// "Nights" in TripPlan = legDays.length = calendar days inclusive (arrive..depart).
// A leg with arrive=depart spans 1 calendar day (the minimum). daysBetween(arrive,
// depart) = span − 1, so the leg can donate when daysBetween ≥ 1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendCityLeg, daysBetween, addDays } from "../lib/trip-window.js";

// Calendar-days span (nights used by TripPlan.nights()).
function span(leg) { return daysBetween(leg.arrive, leg.depart) + 1; }
function totalSpan(legs) { return legs.reduce((s, l) => s + span(l), 0); }

// A 3-leg trip: Ljubljana 2d, Bled 4d, Piran 5d = 11 calendar days total.
// Contiguous: Ljub.depart+1 = Bled.arrive, Bled.depart+1 = Piran.arrive.
const BASE_LEGS = [
  { cityId: "ljubljana-si", name: "Ljubljana",
    arrive: "2026-05-15", depart: "2026-05-16" },  // span=2
  { cityId: "bled-si",      name: "Bled",
    arrive: "2026-05-17", depart: "2026-05-20" },  // span=4
  { cityId: "piran-si",     name: "Piran",
    arrive: "2026-05-21", depart: "2026-05-25" },  // span=5
];
const START = "2026-05-15";
const END   = "2026-05-25";

test("add-city-shaves-longest-leg: Piran (5d) loses 1 calendar day", () => {
  const { legs, error } = appendCityLeg(BASE_LEGS, { cityId: "kobarid-si", name: "Kobarid" }, START, END);
  assert.ok(!error, `unexpected error: ${error}`);
  assert.equal(legs.length, 4);
  // Piran was longest (span 5); should now be span 4.
  const piran = legs.find((l) => l.cityId === "piran-si");
  const kobarid = legs.find((l) => l.cityId === "kobarid-si");
  assert.ok(piran, "Piran still present");
  assert.ok(kobarid, "Kobarid added");
  assert.equal(span(piran), span(BASE_LEGS[2]) - 1, "Piran lost 1 calendar day");
  assert.equal(span(kobarid), 1, "Kobarid has 1 calendar day (the minimum)");
});

test("span-preserved: total calendar days unchanged after append", () => {
  const baseTot = totalSpan(BASE_LEGS);
  const { legs, error } = appendCityLeg(BASE_LEGS, { cityId: "kobarid-si", name: "Kobarid" }, START, END);
  assert.ok(!error);
  assert.equal(totalSpan(legs), baseTot, "total span must be preserved");
});

test("never-below-1-night: all-1-day legs returns error, not a 0-day leg", () => {
  // Each leg spans 1 day (arrive=depart), so none can donate.
  const tinyLegs = [
    { cityId: "a", name: "A", arrive: "2026-05-15", depart: "2026-05-15" },
    { cityId: "b", name: "B", arrive: "2026-05-16", depart: "2026-05-16" },
  ];
  const { legs, error } = appendCityLeg(tinyLegs, { cityId: "c", name: "C" }, "2026-05-15", "2026-05-16");
  assert.ok(error, "should return an error when no leg can donate");
  assert.match(error, /no nights free/i);
  // legs unchanged on error
  assert.deepEqual(legs, tinyLegs);
});

test("empty-trip-first-city: new leg takes the whole window", () => {
  const { legs, error } = appendCityLeg([], { cityId: "bled-si", name: "Bled" }, "2026-06-01", "2026-06-07");
  assert.ok(!error);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].arrive, "2026-06-01");
  assert.equal(legs[0].depart, "2026-06-07");
  assert.equal(legs[0].cityId, "bled-si");
});

test("legs are contiguous and in date order after append", () => {
  const { legs, error } = appendCityLeg(BASE_LEGS, { cityId: "kobarid-si", name: "Kobarid" }, START, END);
  assert.ok(!error);
  // Sorted by arrive
  for (let i = 1; i < legs.length; i++) {
    assert.ok(legs[i].arrive >= legs[i - 1].arrive, "legs should be in date order");
  }
  // Contiguous: prev.depart + 1 === next.arrive
  for (let i = 0; i < legs.length - 1; i++) {
    assert.equal(
      addDays(legs[i].depart, 1),
      legs[i + 1].arrive,
      `boundary ${i}: addDays(${legs[i].depart}, 1) should equal ${legs[i + 1].arrive}`
    );
  }
});

test("single-leg trip donates when it has ≥ 2 days", () => {
  const singleLeg = [
    { cityId: "bled-si", name: "Bled", arrive: "2026-06-01", depart: "2026-06-07" },
  ];
  const { legs, error } = appendCityLeg(singleLeg, { cityId: "piran-si", name: "Piran" }, "2026-06-01", "2026-06-07");
  assert.ok(!error);
  assert.equal(legs.length, 2);
  assert.equal(totalSpan(legs), span(singleLeg[0]));
  legs.forEach((l) => assert.ok(span(l) >= 1, `leg ${l.name} must have span ≥ 1`));
});
