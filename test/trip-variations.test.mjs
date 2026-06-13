// Trip variations / forks (#34). Guards the filtering + decide-by math that
// lets two futures share the same days without either being destroyed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tripForks, forkForDay, activeEntries, choiceCounts, forkDecideBy, makeFork, setActiveChoice, entriesForChoice,
} from "../lib/trip-variations.js";

const FORK = makeFork("f1", "Piran vs Trieste", "2026-05-21", "2026-05-23");
const TRIP = {
  options: { forks: [FORK] },
  entries: [
    { id: "base1", day: "2026-05-15", title: "Ljubljana walk" },            // base — always shown
    { id: "a1", day: "2026-05-21", title: "Piran old town", option: { forkId: "f1", choiceId: "a" }, booking: { cancelBy: "2026-05-18" } },
    { id: "a2", day: "2026-05-22", title: "Piran swim", option: { forkId: "f1", choiceId: "a" } },
    { id: "b1", day: "2026-05-21", title: "Trieste cafés", option: { forkId: "f1", choiceId: "b" }, booking: { cancelBy: "2026-05-15" } },
  ],
};

test("makeFork: two choices, defaults to A active", () => {
  assert.equal(FORK.choices.length, 2);
  assert.equal(FORK.activeChoiceId, "a");
  assert.deepEqual(FORK.range, { from: "2026-05-21", to: "2026-05-23" });
});

test("forkForDay: maps a date to its covering fork", () => {
  assert.equal(forkForDay(TRIP, "2026-05-22")?.id, "f1");
  assert.equal(forkForDay(TRIP, "2026-05-15"), null); // outside the range
});

test("activeEntries: base + active choice only (A active)", () => {
  const ids = activeEntries(TRIP).map((e) => e.id);
  assert.deepEqual(ids, ["base1", "a1", "a2"]); // b1 (choice B) hidden
});

test("activeEntries: switching to B swaps the futures, base stays", () => {
  const t = { ...TRIP, options: setActiveChoice(TRIP.options, "f1", "b") };
  const ids = activeEntries(t).map((e) => e.id);
  assert.deepEqual(ids, ["base1", "b1"]);
});

test("activeEntries: no forks ⇒ identity (existing trips unaffected)", () => {
  const t = { entries: [{ id: "x" }, { id: "y" }] };
  assert.equal(activeEntries(t).length, 2);
});

test("activeEntries: an orphan tag (fork deleted) is shown, never dropped", () => {
  const t = { options: { forks: [] }, entries: [{ id: "o", option: { forkId: "gone", choiceId: "a" } }] };
  assert.deepEqual(activeEntries(t).map((e) => e.id), ["o"]);
});

test("choiceCounts / decide-by: per-choice tally + earliest deadline", () => {
  assert.deepEqual(choiceCounts(TRIP, "f1"), { a: 2, b: 1 });
  assert.equal(forkDecideBy(TRIP, "f1"), "2026-05-15"); // earliest cancelBy across both options
});

test("entriesForChoice: one column of the compare, sorted by day", () => {
  assert.deepEqual(entriesForChoice(TRIP, "f1", "a").map((e) => e.id), ["a1", "a2"]);
  assert.deepEqual(entriesForChoice(TRIP, "f1", "b").map((e) => e.id), ["b1"]);
  assert.deepEqual(entriesForChoice(TRIP, "f1", "z"), []); // empty choice
});

test("untagged in-range entries belong to the first choice implicitly (#62 — no tag burst on fork creation)", () => {
  // A fork was just created over 05-21..05-23 as a SINGLE frame write; the
  // in-range entries are untagged but must read as Option A.
  const trip = {
    options: { forks: [makeFork("f2", "Piran vs Trieste", "2026-05-21", "2026-05-23")] },
    entries: [
      { id: "base", day: "2026-05-15", title: "Ljubljana" },            // outside the fork
      { id: "u1", day: "2026-05-21", title: "Piran walk" },             // untagged, in range
      { id: "u2", day: "2026-05-22", title: "Piran swim", booking: { cancelBy: "2026-05-18" } },
      { id: "b1", day: "2026-05-21", title: "Trieste", option: { forkId: "f2", choiceId: "b" } },
    ],
  };
  // Option A active (default): base + the untagged in-range entries; not B's.
  assert.deepEqual(activeEntries(trip).map((e) => e.id), ["base", "u1", "u2"]);
  // Switch to B: base + only the explicitly-B-tagged entry.
  const onB = { ...trip, options: setActiveChoice(trip.options, "f2", "b") };
  assert.deepEqual(activeEntries(onB).map((e) => e.id), ["base", "b1"]);
  // Counts + compare include the implicit ones under A.
  assert.deepEqual(choiceCounts(trip, "f2"), { a: 2, b: 1 });
  assert.deepEqual(entriesForChoice(trip, "f2", "a").map((e) => e.id), ["u1", "u2"]);
  // decide-by still only counts explicitly-tagged bookings (none here) → null;
  // the untagged in-range booking is implicit, not a committed fork hold.
  assert.equal(forkDecideBy(trip, "f2"), null);
});

test("setActiveChoice: immutable — original options untouched", () => {
  const next = setActiveChoice(TRIP.options, "f1", "b");
  assert.equal(next.forks[0].activeChoiceId, "b");
  assert.equal(TRIP.options.forks[0].activeChoiceId, "a"); // original unchanged
});
