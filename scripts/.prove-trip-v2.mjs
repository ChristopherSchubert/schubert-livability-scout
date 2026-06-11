// Proves the lib/trip.js v2 helpers (issue #10) against a fixture that encodes
// the real Slovenia trip's cash-only cases. Not a measurement and not invented
// data dressed as one — a unit-test fixture, run by the agent (the owner never
// runs scripts). Once #14 migrates the live trip, the same assertions should
// hold against the hydrated DB rows.
//
//   node scripts/.prove-trip-v2.mjs

import assert from "node:assert/strict";
import {
  cashNeeded, reservationLedger, bookingChecklist, markerUnion,
  transportDeepLinks, entriesByDay, kindToV2, rowToEntry, entryToRow,
} from "../lib/trip.js";

// The three real cash-on-site cases (CLAUDE.md / issue #10): Pletna €36,
// vintage boat €511, paragliding €380 — all paid on site, cash only = €927.
// Plus a prepaid-but-cash-only venue that must NOT count (the v2 fix), and a
// card-on-site case that must NOT count (cashOnly false).
const trip = {
  startDate: "2026-05-18", endDate: "2026-05-20",
  travelers: [
    { name: "Janice", kind: "person", chips: ["veg"] },
    { name: "Chris", kind: "person", chips: ["veg"] },
  ],
  passes: [{ id: "ljubljana-city-card", name: "Ljubljana City Card", cost: 36 }],
  legs: [{ cityId: "bled", name: "Bled, Slovenia", arrive: "2026-05-18", depart: "2026-05-20", tz: "Europe/Ljubljana" }],
  entries: [
    { id: "pletna", day: "2026-05-19", category: "activity", status: "booked", title: "Pletna boat to Bled Island",
      time: { mode: "point", at: "14:00" },
      cost: { amount: 36, currency: "EUR", per: "person", payment: "onSite", cashOnly: true } },
    { id: "boat", day: "2026-05-18", category: "activity", status: "booked", title: "Vintage boat",
      time: { mode: "range", start: "10:00", end: "12:00" },
      cost: { amount: 511, currency: "EUR", per: "total", payment: "onSite", cashOnly: true } },
    { id: "para", day: "2026-05-20", category: "activity", status: "booked", title: "Paragliding",
      time: { mode: "bucket", bucket: "morning" },
      vendor: "Flying Bear",
      cost: { amount: 380, currency: "EUR", per: "person", payment: "onSite", cashOnly: true },
      booking: { confirmation: "FB-9921", cancelBy: "2026-05-13" } },
    { id: "franko", day: "2026-05-19", category: "meal", status: "reserved", title: "Hiša Franko",
      time: { mode: "point", at: "19:30" },
      cost: { amount: 290, currency: "EUR", per: "total", payment: "prepaid", cashOnly: true }, // prepaid → no wallet cash
      booking: { cancelBy: "2026-05-12" } },
    { id: "lunch", day: "2026-05-18", category: "meal", status: "none", title: "Lunch (card OK)",
      time: { mode: "bucket", bucket: "afternoon" },
      cost: { amount: 40, currency: "EUR", per: "total", payment: "onSite", cashOnly: false } }, // card → no cash
    { id: "vintgar", day: "2026-05-19", category: "activity", status: "toBook", title: "Vintgar Gorge",
      time: { mode: "range", start: "11:00", end: "11:20" },
      booking: { bookBy: "2026-05-01", leadTime: "books out weeks ahead" } },
  ],
};

// cashNeeded — the headline assertion: onSite ∧ cashOnly only.
assert.deepEqual(cashNeeded(trip), { EUR: 927 }, "cash to carry should be €927");

// reservationLedger — all held slots (status reserved|booked) + deadline-
// carriers; lodging would rank first (none here), then soonest cancel-by.
// Franko (05-12) < para (05-13) < the two booked-but-no-deadline tours (last,
// stable). The toBook Vintgar is not a held slot → excluded.
const led = reservationLedger(trip).map((e) => e.id);
assert.deepEqual(led, ["franko", "para", "pletna", "boat"], "ledger soonest cancel-by first, no-deadline last");

// bookingChecklist — only the toBook entry, with its lead time.
const chk = bookingChecklist(trip);
assert.equal(chk.length, 1);
assert.equal(chk[0].id, "vintgar");
assert.equal(chk[0].bookBy, "2026-05-01");

// markerUnion — union of traveler chips (both veg). No dog row → 🐾 absent.
assert.deepEqual(markerUnion(trip).sort(), ["veg"]);
assert.ok(markerUnion(trip, { showAll: true }).includes("dog"), "show-all reveals dog");

// transportDeepLinks — zero-API deep links from carrier+number.
const links = transportDeepLinks({ mode: "flight", carrier: "LH", number: "1462" });
assert.equal(links.flightAware, "https://flightaware.com/live/flight/LH1462");
assert.ok(links.googleStatus.includes("LH%201462%20status"));
assert.deepEqual(transportDeepLinks({}), { flightAware: null, googleStatus: null });
assert.equal(transportDeepLinks({ mode: "train", carrier: "OBB", number: "151" }).flightAware, null);

// entriesByDay — timed entries sort by clock; bucketed entry (paragliding is
// its own day) and ordering within 05-19: Vintgar 11:00 < Pletna 14:00 < Franko 19:30.
const byDay = entriesByDay(trip);
assert.deepEqual(byDay["2026-05-19"].map((e) => e.id), ["vintgar", "pletna", "franko"]);

// kindToV2 — the migration mapping (issue #14 uses it).
assert.deepEqual(kindToV2("meal"), { category: "meal", status: "none" });
assert.deepEqual(kindToV2("todo"), { category: "errand", status: "toBook" });
assert.deepEqual(kindToV2("checkin"), { category: "stay", status: "none" });

// rowToEntry / entryToRow round-trip — id/day/sort are columns, the rest payload.
const row = { id: "x1", trip_id: "t1", day: "2026-05-19", sort: 3, payload: { category: "meal", title: "Dinner" } };
const e = rowToEntry(row);
assert.deepEqual(e, { id: "x1", day: "2026-05-19", sort: 3, category: "meal", title: "Dinner" });
const back = entryToRow("t1", e);
assert.equal(back.trip_id, "t1");
assert.equal(back.day, "2026-05-19");
assert.equal(back.sort, 3);
assert.deepEqual(back.payload, { category: "meal", title: "Dinner" });

console.log("✓ all lib/trip.js v2 helper assertions passed (cashNeeded = €927)");
