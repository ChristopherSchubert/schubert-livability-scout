// Trip data-layer + solve tests (#42). Guards the round-trips and the solver
// that the whole /trips feature rides on. node:test, zero deps. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToTrip, tripToRow, cashNeeded, bookingsLedger, tripDays, entriesByDay } from "../lib/trip.js";
import { solveTripDay } from "../lib/solve-adapter.js";

test("rowToTrip / tripToRow: travelers + passes survive a round-trip", () => {
  const row = {
    id: "t1", user_id: "u1", name: "Slovenia", start_date: "2026-05-15", end_date: "2026-05-25",
    legs: [{ name: "Bled" }], travelers: [{ name: "Janice", kind: "person", chips: ["veg"] }],
    passes: [{ id: "p1", name: "Card" }], entries: [],
  };
  const trip = rowToTrip(row);
  assert.deepEqual(trip.travelers, row.travelers);
  assert.deepEqual(trip.passes, row.passes);
  const back = tripToRow(trip);
  assert.deepEqual(back.travelers, row.travelers);
  assert.deepEqual(back.passes, row.passes);
  assert.equal(back.start_date, "2026-05-15");
});

test("rowToTrip: missing travelers/passes default to []", () => {
  const t = rowToTrip({ id: "x", name: "Bare" });
  assert.deepEqual(t.travelers, []);
  assert.deepEqual(t.passes, []);
});

test("cashNeeded: sums only cash-only costs, by currency", () => {
  const trip = { entries: [
    { cost: { amount: 380, currency: "EUR", cashOnly: true } },
    { cost: { amount: 511, currency: "EUR", cashOnly: true } },
    { cost: { amount: 36, currency: "EUR", cashOnly: true } },
    { cost: { amount: 100, currency: "EUR", cashOnly: false } }, // prepaid — excluded
    { cost: { amount: 20, currency: "USD", cashOnly: true } },
  ] };
  assert.deepEqual(cashNeeded(trip), { EUR: 927, USD: 20 });
});

test("bookingsLedger: confirmation OR deadline, sorted soonest deadline first", () => {
  const trip = { entries: [
    { id: "a", title: "Late", booking: { cancelBy: "2026-05-20" } },
    { id: "b", title: "Early", booking: { cancelBy: "2026-05-12" } },
    { id: "c", title: "Conf only", booking: { confirmation: "X9" } },
    { id: "d", title: "Nothing" },
  ] };
  const led = bookingsLedger(trip);
  assert.equal(led.length, 3);
  assert.equal(led[0].id, "b"); // earliest cancelBy first
});

test("tripDays / entriesByDay: enumerate the window, bucket dated entries", () => {
  const trip = {
    startDate: "2026-06-01", endDate: "2026-06-03",
    legs: [{ name: "X", arrive: "2026-06-01", depart: "2026-06-03" }],
    entries: [{ id: "e1", day: "2026-06-02", title: "mid" }, { id: "e2", day: null, title: "shelf" }],
  };
  const days = tripDays(trip);
  assert.equal(days.length, 3);
  assert.ok(!days.some((d) => !d.date)); // no real day is undated
  const by = entriesByDay(trip);
  assert.equal((by["2026-06-02"] || []).length, 1);
  // undated entries bucket under 'null' — never rendered, since the Days view
  // iterates tripDays (real dates only). They live on the Shelf instead.
  assert.ok((by["2026-06-02"] || []).every((e) => e.id !== "e2"));
});

test("solveTripDay: floats place, meals hit a window, booked stays pinned", () => {
  const entries = [
    { id: "a", category: "activity", status: "none", title: "Museum", time: { mode: "bucket" }, place: { lat: 46.05, lon: 14.50 } },
    { id: "b", category: "meal", status: "none", title: "Lunch", time: { mode: "bucket" }, place: { lat: 46.052, lon: 14.505 } },
    { id: "c", category: "activity", status: "booked", title: "Castle", time: { mode: "range", start: "15:00", end: "16:30" }, place: { lat: 46.048, lon: 14.508 } },
  ];
  const { times, feasible } = solveTripDay(entries, { lodging: { lat: 46.051, lon: 14.502 } });
  assert.equal(feasible, true);
  assert.equal(times.c.start, "15:00"); // booked PINNED
  assert.ok(times.a && /^\d\d:\d\d$/.test(times.a.start)); // float got a clock time
  // meal lands inside a configured meal window (lunch 12–14 or dinner 18:30–21)
  const mealStart = Number(times.b.start.slice(0, 2)) * 60 + Number(times.b.start.slice(3, 5));
  assert.ok((mealStart >= 720 && mealStart <= 840) || (mealStart >= 1110 && mealStart <= 1260), `meal at ${times.b.start}`);
});

test("solveTripDay: travel/stay entries get no time (they aren't anchors)", () => {
  const entries = [
    { id: "t", category: "travel", status: "none", title: "Drive", time: { mode: "bucket" } },
    { id: "s", category: "stay", status: "booked", title: "Hotel", time: { mode: "bucket" } },
    { id: "a", category: "activity", status: "none", title: "Walk", time: { mode: "bucket" }, place: { lat: 46.05, lon: 14.5 } },
  ];
  const { times } = solveTripDay(entries, {});
  assert.ok(!times.t && !times.s);
  assert.ok(times.a);
});
