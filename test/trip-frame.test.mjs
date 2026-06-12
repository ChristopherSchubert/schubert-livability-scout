// Trip frame derivation tests (#33). Guards that the briefing layer DERIVES
// every value and never fabricates — blanks where unknown, cites where known.
import { test } from "node:test";
import assert from "node:assert/strict";
import { glanceFacts, tripLimitations, bookingChecklist, tripSources, markerUnion } from "../lib/trip-frame.js";

const TRIP = {
  id: "t1", name: "Slovenia", theme: "lakes + old towns",
  startDate: "2026-05-15", endDate: "2026-05-18",
  legs: [{ name: "Bled, Slovenia", arrive: "2026-05-15", depart: "2026-05-18", cityId: "bled" }],
  travelers: [
    { name: "Chris", kind: "person", chips: ["veg"] },
    { name: "Janice", kind: "person", chips: [] },
    { name: "Rex", kind: "pet", chips: [] },
  ],
  entries: [
    { id: "s", category: "stay", title: "Vila Bled", place: { name: "Vila Bled", lat: 46.36, lon: 14.09, placeId: "p1" }, time: { mode: "point", at: "15:00" } },
    { id: "a", category: "activity", title: "Castle", place: { name: "Bled Castle", lat: 46.36, lon: 14.10, placeId: "p2" }, day: "2026-05-16", time: { mode: "range", start: "10:00", end: "11:30" } },
    { id: "u", category: "activity", title: "Mystery walk", day: "2026-05-16", time: { mode: "bucket" } }, // unpinned + unscheduled
    { id: "b", category: "meal", title: "Dinner", status: "toBook", day: "2026-05-16", place: { name: "Ostarija", lat: 46.37, lon: 14.11, placeId: "p3" }, time: { mode: "bucket" }, booking: { cancelBy: "2026-05-10", phone: "+386 1 234" } },
    { id: "c", category: "meal", title: "Lunch", cost: { amount: 40, currency: "EUR", cashOnly: true }, place: { name: "Cafe", lat: 46.36, lon: 14.09, placeId: "p4" }, day: "2026-05-16", time: { mode: "range", start: "13:00" } },
    { id: "k", category: "activity", title: "Booked tour", status: "booked", booking: { confirmation: "ABC123" }, place: { name: "Tour", lat: 46.36, lon: 14.10, placeId: "p5" }, day: "2026-05-17", time: { mode: "range", start: "09:00" } },
  ],
};

test("glanceFacts: real facts present, unknowns are null (never guessed)", () => {
  const f = glanceFacts(TRIP);
  const by = Object.fromEntries(f.map((r) => [r.label, r.value]));
  assert.equal(by.Destination, "Bled");
  assert.equal(by.Dates, "2026-05-15 – 2026-05-18");
  assert.equal(by.Nights, "3");
  assert.equal(by.Lodging, "Vila Bled");
  assert.equal(by["Check-in"], "15:00");
  assert.equal(by.Diet, "veg");
  assert.ok(by.Travelers.includes("Chris") && by.Travelers.includes("Rex"));
  assert.equal(by.Theme, "lakes + old towns");
  assert.equal(by.Weather, null); // not fetched → honest blank, not a guess
  assert.equal(by["Drive from home"], null);
});

test("tripLimitations: each derived warning carries a cited source + asOf", () => {
  const lims = tripLimitations(TRIP, "2026-06-12");
  assert.ok(lims.length >= 3);
  assert.ok(lims.every((l) => l.source && l.asOf === "2026-06-12"));
  assert.ok(lims.some((l) => /pinned/.test(l.text))); // the unpinned activity
  assert.ok(lims.some((l) => /clock time/.test(l.text))); // unscheduled
  assert.ok(lims.some((l) => /to book/.test(l.text))); // toBook
  assert.ok(lims.some((l) => /cash/.test(l.text) && /40/.test(l.text))); // cashNeeded
});

test("tripLimitations: a clean trip yields no flags", () => {
  const clean = { startDate: "2026-05-15", endDate: "2026-05-16", legs: [], entries: [
    { id: "x", category: "activity", status: "booked", day: "2026-05-15", place: { lat: 1, lon: 1 }, time: { mode: "range", start: "10:00" } },
  ] };
  assert.deepEqual(tripLimitations(clean, "2026-06-12"), []);
});

test("bookingChecklist: derives from to-book + ledger, confirmed rows done, sorted", () => {
  const rows = bookingChecklist(TRIP);
  const dinner = rows.find((r) => r.id === "b");
  const tour = rows.find((r) => r.id === "k");
  assert.equal(dinner.done, false);
  assert.equal(dinner.bookBy, "2026-05-10");
  assert.equal(dinner.phone, "+386 1 234");
  assert.equal(tour.done, true); // confirmation → done
  assert.equal(tour.confirmation, "ABC123");
  // not-done sort before done
  assert.ok(rows.findIndex((r) => r.id === "b") < rows.findIndex((r) => r.id === "k"));
});

test("tripSources: lists only provenances actually present", () => {
  const s = tripSources(TRIP);
  const names = s.map((x) => x.source);
  assert.ok(names.some((n) => /Google Places/.test(n)));
  assert.ok(names.some((n) => /costs/.test(n)));
  assert.ok(names.some((n) => /Booking/.test(n)));
  assert.ok(!names.some((n) => /NOAA/.test(n))); // no weather → not listed
});

test("markerUnion: unions entry markers + traveler chips, deduped", () => {
  const t = { entries: [{ markers: [{ type: "dog" }, { type: "veg" }] }, { markers: [{ type: "dog" }] }], travelers: [{ chips: ["veg"] }] };
  const u = markerUnion(t);
  const types = u.map((m) => m.type);
  assert.ok(types.includes("dog") && types.includes("veg"));
  assert.equal(types.filter((x) => x === "dog").length, 1); // deduped
});
