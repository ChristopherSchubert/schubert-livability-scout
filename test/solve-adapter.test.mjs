// solve-adapter tests — guards the connective-block output (Feature A) and
// the first-class pinned flag (Feature B). node:test, zero deps.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { solveTripDay, fixedTimeOf } from "../lib/solve-adapter.js";

// ── Feature A: schedule includes connective blocks ───────────────────────────

test("solveTripDay: schedule is returned alongside times", () => {
  const entries = [
    { id: "a", category: "activity", status: "none", title: "Museum",
      time: { mode: "bucket" }, place: { lat: 46.05, lon: 14.50 } },
    { id: "b", category: "activity", status: "none", title: "Castle",
      time: { mode: "bucket" }, place: { lat: 46.06, lon: 14.51 } },
  ];
  const { times, schedule } = solveTripDay(entries, { lodging: { lat: 46.055, lon: 14.505 } });
  // schedule must be an array
  assert.ok(Array.isArray(schedule), "schedule should be an array");
  // there must be at least as many rows as placed anchors
  assert.ok(schedule.length >= Object.keys(times).length, "schedule must include at least the anchors");
});

test("solveTripDay: schedule contains generated connective blocks", () => {
  // Two activities far enough apart that a travel leg is generated between them.
  const entries = [
    { id: "a", category: "activity", status: "none", title: "Museum",
      time: { mode: "bucket" }, place: { lat: 46.05, lon: 14.50 } },
    { id: "b", category: "activity", status: "none", title: "Winery",
      time: { mode: "bucket" }, place: { lat: 46.10, lon: 14.80 } }, // ~25 km away → drive
  ];
  const { schedule } = solveTripDay(entries, { lodging: { lat: 46.05, lon: 14.50 } });
  const connectives = schedule.filter((r) => r.generated === true);
  assert.ok(connectives.length > 0, "at least one generated connective row expected");
  // Each connective must have the synthetic key prefix
  connectives.forEach((r) => {
    assert.ok(r.key && r.key.startsWith("__gen_"), `connective key should be __gen_<i>, got: ${r.key}`);
    // Must NOT have an entry id (these are view-only, not persisted)
    assert.ok(!r.id, "connective row must not carry an entry id");
  });
});

test("solveTripDay: anchor rows in schedule carry the entry id", () => {
  const entries = [
    { id: "x", category: "activity", status: "none", title: "Walk",
      time: { mode: "bucket" }, place: { lat: 46.05, lon: 14.50 } },
  ];
  const { schedule } = solveTripDay(entries, {});
  const anchors = schedule.filter((r) => r.id === "x");
  assert.ok(anchors.length === 1, "anchor row with entry id 'x' must appear in schedule");
  assert.ok(!anchors[0].generated, "anchor row must not be flagged as generated");
});

// ── Feature B: pinned is first-class ─────────────────────────────────────────

test("fixedTimeOf: e.pinned=true + start → fixed, regardless of status", () => {
  const pinned = { pinned: true, status: "none", time: { mode: "range", start: "10:00", end: "12:00" } };
  assert.equal(fixedTimeOf(pinned), "10:00");
});

test("fixedTimeOf: status=booked + start → fixed (backwards compat)", () => {
  const booked = { pinned: false, status: "booked", time: { mode: "range", start: "15:00", end: "16:30" } };
  assert.equal(fixedTimeOf(booked), "15:00");
});

test("fixedTimeOf: neither pinned nor booked → null (floating)", () => {
  const floating = { status: "none", time: { mode: "range", start: "09:00" } };
  assert.equal(fixedTimeOf(floating), null);
});

test("fixedTimeOf: pinned=true but NO start time → null (nothing to pin to)", () => {
  const noTime = { pinned: true, status: "none", time: { mode: "bucket" } };
  assert.equal(fixedTimeOf(noTime), null);
});

test("solveTripDay: pinned entry (non-booked) stays at its declared start", () => {
  const entries = [
    // pinned, status=none — must be treated as a fixed anchor
    { id: "p", category: "activity", status: "none", pinned: true, title: "Pinned event",
      time: { mode: "range", start: "11:00", end: "12:00" }, place: { lat: 46.05, lon: 14.50 } },
    // floating — will get placed around the pinned one
    { id: "f", category: "activity", status: "none", title: "Floating walk",
      time: { mode: "bucket" }, place: { lat: 46.051, lon: 14.501 } },
  ];
  const { times } = solveTripDay(entries, { lodging: { lat: 46.052, lon: 14.502 } });
  assert.equal(times.p?.start, "11:00", "pinned entry must stay at 11:00");
  assert.ok(times.f, "floating entry must receive a time");
  assert.notEqual(times.f.start, "11:00", "floating entry must not collide with the pin");
});
