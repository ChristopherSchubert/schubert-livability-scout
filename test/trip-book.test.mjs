// Tests for the Book-page helpers added in #9:
//   cashNeededLines, splitBookings, holdPhrase, isUrgent.
// node:test, zero deps. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cashNeededLines,
  splitBookings,
  holdPhrase,
  isUrgent,
  bookingClass,
} from "../lib/trip.js";

// ── cashNeededLines ──────────────────────────────────────────────────────────

test("cashNeededLines: returns one line per cash-only entry", () => {
  const trip = {
    entries: [
      { title: "Paragliding", cost: { amount: 380, currency: "EUR", cashOnly: true } },
      { title: "Vintage boat", cost: { amount: 511, currency: "EUR", cashOnly: true } },
      { title: "Pletna boat",  cost: { amount: 36,  currency: "EUR", cashOnly: true } },
      { title: "Hotel",        cost: { amount: 200, currency: "EUR", cashOnly: false } }, // prepaid
    ],
  };
  const lines = cashNeededLines(trip);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].title, "Paragliding");
  assert.equal(lines[0].amount, 380);
  assert.equal(lines[0].currency, "EUR");
  assert.ok(lines.every((l) => l.currency === "EUR"));
});

test("cashNeededLines: empty trip returns []", () => {
  assert.deepEqual(cashNeededLines({ entries: [] }), []);
});

test("cashNeededLines: entries with null/missing cost are skipped", () => {
  const trip = {
    entries: [
      { title: "No cost" },
      { title: "Cost but not cash", cost: { amount: 50, currency: "EUR", cashOnly: false } },
      { title: "Cash", cost: { amount: 10, currency: "EUR", cashOnly: true } },
    ],
  };
  const lines = cashNeededLines(trip);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].title, "Cash");
});

// ── bookingClass ─────────────────────────────────────────────────────────────

test("bookingClass: confirmation → booked", () => {
  assert.equal(bookingClass({ booking: { confirmation: "X123" } }), "booked");
});

test("bookingClass: cancelBy only → needsAction", () => {
  assert.equal(bookingClass({ booking: { cancelBy: "2026-05-12" } }), "needsAction");
});

test("bookingClass: status=toBook → needsAction", () => {
  assert.equal(bookingClass({ status: "toBook" }), "needsAction");
});

test("bookingClass: status=reserved without confirmation → needsAction", () => {
  assert.equal(bookingClass({ status: "reserved", booking: {} }), "needsAction");
});

test("bookingClass: no booking data → null", () => {
  assert.equal(bookingClass({ title: "Something" }), null);
});

// ── holdPhrase ───────────────────────────────────────────────────────────────

test("holdPhrase: prepaid marker → 'prepaid 🔒'", () => {
  const e = { booking: { confirmation: "X" }, markers: [{ type: "prepaid" }] };
  assert.equal(holdPhrase(e), "prepaid 🔒");
});

test("holdPhrase: booking.prepaid=true → 'prepaid 🔒'", () => {
  const e = { booking: { confirmation: "X", prepaid: true }, markers: [] };
  assert.equal(holdPhrase(e), "prepaid 🔒");
});

test("holdPhrase: heldToArrival → 'held to arrival'", () => {
  const e = { booking: { confirmation: "X", heldToArrival: true }, markers: [] };
  assert.equal(holdPhrase(e), "held to arrival");
});

test("holdPhrase: cancelBy set → 'free-cancel by <date>'", () => {
  const e = { booking: { cancelBy: "2026-05-12", confirmation: "X" }, markers: [] };
  assert.equal(holdPhrase(e), "free-cancel by 2026-05-12");
});

test("holdPhrase: no signals on booked entry → null", () => {
  const e = { booking: { confirmation: "X" }, markers: [] };
  assert.equal(holdPhrase(e), null);
});

test("holdPhrase: no confirmation → 'to book'", () => {
  const e = { status: "toBook", markers: [] };
  assert.equal(holdPhrase(e), "to book");
});

// ── isUrgent ─────────────────────────────────────────────────────────────────

test("isUrgent: cancelBy within 5 days of referenceDate → true", () => {
  assert.ok(isUrgent({ booking: { cancelBy: "2026-05-17" } }, "2026-05-14"));
});

test("isUrgent: cancelBy more than 5 days away → false", () => {
  assert.ok(!isUrgent({ booking: { cancelBy: "2026-05-25" } }, "2026-05-14"));
});

test("isUrgent: no cancelBy → false", () => {
  assert.ok(!isUrgent({ booking: { confirmation: "X" } }, "2026-05-14"));
});

test("isUrgent: cancelBy exactly 5 days away → true (boundary inclusive)", () => {
  assert.ok(isUrgent({ booking: { cancelBy: "2026-05-19" } }, "2026-05-14"));
});

// ── splitBookings ─────────────────────────────────────────────────────────────

test("splitBookings: confirmed entries go to booked, unconfirmed with cancelBy go to needsAction", () => {
  const trip = {
    entries: [
      { id: "a", title: "Hotel Union", booking: { confirmation: "SYN2281-99143", cancelBy: "2026-05-12" } },
      { id: "b", title: "Toplice", booking: { confirmation: "PH27710297", heldToArrival: true } },
      { id: "c", title: "Postojna Cave", status: "toBook" },
      { id: "d", title: "Via Ferrata", booking: { confirmation: "#138953", prepaid: true } },
      { id: "e", title: "Nothing" },
    ],
  };
  const { needsAction, booked } = splitBookings(trip);
  // "a" has a confirmation → booked (the cancelBy is just the hold phrase)
  // "b" confirmed → booked
  // "c" toBook, no confirmation → needsAction
  // "d" confirmed → booked
  // "e" no booking info → excluded from both
  assert.ok(booked.some((e) => e.id === "a"));
  assert.ok(booked.some((e) => e.id === "b"));
  assert.ok(booked.some((e) => e.id === "d"));
  assert.ok(needsAction.some((e) => e.id === "c"));
  assert.ok(!needsAction.some((e) => e.id === "e"));
  assert.ok(!booked.some((e) => e.id === "e"));
});

test("splitBookings: needsAction sorted soonest cancelBy first", () => {
  const trip = {
    entries: [
      { id: "x", title: "Late",  booking: { cancelBy: "2026-05-20" } },
      { id: "y", title: "Early", booking: { cancelBy: "2026-05-12" } },
      { id: "z", title: "No cancelBy", status: "toBook" },
    ],
  };
  const { needsAction } = splitBookings(trip);
  const ids = needsAction.map((e) => e.id);
  assert.equal(ids[0], "y"); // earliest cancelBy first
  assert.equal(ids[ids.length - 1], "z"); // no-cancelBy last
});

test("splitBookings: empty trip returns empty lists", () => {
  const { needsAction, booked } = splitBookings({ entries: [] });
  assert.deepEqual(needsAction, []);
  assert.deepEqual(booked, []);
});
