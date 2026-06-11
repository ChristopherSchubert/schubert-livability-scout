// lib/trip.js — entry-atom v2 domain helpers (issues #10, #41). Ports the
// assertions from scripts/.prove-trip-v2.mjs into the suite + adds edge cases.
import { describe, it, expect } from "vitest";
import {
  cashNeeded,
  reservationLedger,
  bookingChecklist,
  markerUnion,
  transportDeepLinks,
  entriesByDay,
  tripDays,
  legTzChanges,
  kindToV2,
  rowToTrip,
  tripToRow,
  rowToEntry,
  entryToRow,
  ENTRY_CATEGORIES,
  ENTRY_STATUSES,
} from "../lib/trip.js";

// The real Slovenia cash cases: Pletna 36 + vintage boat 511 + paragliding 380
// = 927, all onSite ∧ cashOnly. A prepaid-but-cash-only (Franko) and a
// card-on-site (lunch) must NOT count.
const trip = {
  startDate: "2026-05-18",
  endDate: "2026-05-20",
  travelers: [
    { name: "Janice", kind: "person", chips: ["veg"] },
    { name: "Chris", kind: "person", chips: ["veg"] },
  ],
  legs: [
    {
      cityId: "bled",
      name: "Bled, Slovenia",
      arrive: "2026-05-18",
      depart: "2026-05-20",
      tz: "Europe/Ljubljana",
    },
  ],
  entries: [
    {
      id: "pletna",
      day: "2026-05-19",
      category: "activity",
      status: "booked",
      title: "Pletna boat",
      time: { mode: "point", at: "14:00" },
      cost: { amount: 36, currency: "EUR", payment: "onSite", cashOnly: true },
    },
    {
      id: "boat",
      day: "2026-05-18",
      category: "activity",
      status: "booked",
      title: "Vintage boat",
      time: { mode: "range", start: "10:00", end: "12:00" },
      cost: { amount: 511, currency: "EUR", payment: "onSite", cashOnly: true },
    },
    {
      id: "para",
      day: "2026-05-20",
      category: "activity",
      status: "booked",
      title: "Paragliding",
      time: { mode: "bucket", bucket: "morning" },
      cost: { amount: 380, currency: "EUR", payment: "onSite", cashOnly: true },
      booking: { confirmation: "FB-9921", cancelBy: "2026-05-13" },
    },
    {
      id: "franko",
      day: "2026-05-19",
      category: "meal",
      status: "reserved",
      title: "Hiša Franko",
      time: { mode: "point", at: "19:30" },
      cost: { amount: 290, currency: "EUR", payment: "prepaid", cashOnly: true },
      booking: { cancelBy: "2026-05-12" },
    },
    {
      id: "lunch",
      day: "2026-05-18",
      category: "meal",
      status: "none",
      title: "Lunch",
      time: { mode: "bucket", bucket: "afternoon" },
      cost: { amount: 40, currency: "EUR", payment: "onSite", cashOnly: false },
    },
    {
      id: "vintgar",
      day: "2026-05-19",
      category: "activity",
      status: "toBook",
      title: "Vintgar Gorge",
      time: { mode: "range", start: "11:00", end: "11:20" },
      booking: { bookBy: "2026-05-01", leadTime: "weeks ahead" },
    },
  ],
};

describe("cashNeeded", () => {
  it("sums only onSite ∧ cashOnly, by currency = €927", () => {
    expect(cashNeeded(trip)).toEqual({ EUR: 927 });
  });
  it("excludes prepaid even when cashOnly", () => {
    expect(
      cashNeeded({
        entries: [{ cost: { amount: 9, currency: "EUR", payment: "prepaid", cashOnly: true } }],
      })
    ).toEqual({});
  });
  it("ignores costs without a finite amount or currency", () => {
    expect(
      cashNeeded({
        entries: [{ cost: { amount: NaN, currency: "EUR", payment: "onSite", cashOnly: true } }],
      })
    ).toEqual({});
  });
  it("is empty for a trip with no entries", () => {
    expect(cashNeeded({})).toEqual({});
  });
});

describe("reservationLedger", () => {
  it("lists held slots + deadline carriers, soonest cancel-by first, no-deadline last", () => {
    expect(reservationLedger(trip).map((e) => e.id)).toEqual(["franko", "para", "pletna", "boat"]);
  });
  it("ranks lodging (stay) above non-lodging", () => {
    const led = reservationLedger({
      entries: [
        { id: "act", category: "activity", status: "booked", booking: { cancelBy: "2026-01-01" } },
        { id: "hotel", category: "stay", status: "booked", booking: { cancelBy: "2026-09-01" } },
      ],
    });
    expect(led.map((e) => e.id)).toEqual(["hotel", "act"]);
  });
  it("excludes toBook entries (not held slots)", () => {
    expect(reservationLedger(trip).some((e) => e.id === "vintgar")).toBe(false);
  });
});

describe("bookingChecklist", () => {
  it("derives from status === toBook, soonest bookBy first", () => {
    const chk = bookingChecklist(trip);
    expect(chk).toHaveLength(1);
    expect(chk[0]).toMatchObject({ id: "vintgar", bookBy: "2026-05-01", leadTime: "weeks ahead" });
  });
});

describe("markerUnion", () => {
  it("unions traveler chips (both veg, no dog row)", () => {
    expect(markerUnion(trip).sort()).toEqual(["veg"]);
  });
  it("show-all reveals every attribute marker", () => {
    expect(markerUnion(trip, { showAll: true })).toContain("dog");
  });
  it("is empty when there are no travelers", () => {
    expect(markerUnion({})).toEqual([]);
  });
});

describe("transportDeepLinks", () => {
  it("builds a FlightAware link for flights", () => {
    expect(transportDeepLinks({ mode: "flight", carrier: "LH", number: "1462" }).flightAware).toBe(
      "https://flightaware.com/live/flight/LH1462"
    );
  });
  it("builds a Google status query", () => {
    expect(
      transportDeepLinks({ mode: "flight", carrier: "LH", number: "1462" }).googleStatus
    ).toContain("LH%201462%20status");
  });
  it("returns nulls without carrier+number", () => {
    expect(transportDeepLinks({})).toEqual({ flightAware: null, googleStatus: null });
  });
  it("does not build FlightAware for non-flights", () => {
    expect(transportDeepLinks({ mode: "train", carrier: "OBB", number: "151" }).flightAware).toBe(
      null
    );
  });
});

describe("entriesByDay", () => {
  it("sorts timed entries by clock within a day", () => {
    expect(entriesByDay(trip)["2026-05-19"].map((e) => e.id)).toEqual([
      "vintgar",
      "pletna",
      "franko",
    ]);
  });
  it("orders untimed (bucket) entries after timed ones", () => {
    const by = entriesByDay({
      entries: [
        { id: "bucket", day: "d", time: { mode: "bucket", bucket: "evening" } },
        { id: "timed", day: "d", time: { mode: "point", at: "09:00" } },
      ],
    });
    expect(by["d"].map((e) => e.id)).toEqual(["timed", "bucket"]);
  });
});

describe("tripDays", () => {
  it("emits one day per date with its covering leg", () => {
    const days = tripDays(trip);
    expect(days).toHaveLength(3);
    expect(days[0]).toMatchObject({ date: "2026-05-18", cityId: "bled", tz: "Europe/Ljubljana" });
  });
  it("returns [] for an invalid range", () => {
    expect(tripDays({ startDate: "2026-05-20", endDate: "2026-05-18" })).toEqual([]);
  });
});

describe("legTzChanges (timezone spike #37)", () => {
  it("flags the leg-boundary day where the zone changes", () => {
    const usTrip = {
      startDate: "2026-09-01",
      endDate: "2026-09-04",
      legs: [
        { name: "New York", arrive: "2026-09-01", depart: "2026-09-02", tz: "America/New_York" },
        { name: "Denver", arrive: "2026-09-03", depart: "2026-09-04", tz: "America/Denver" },
      ],
    };
    expect(legTzChanges(usTrip)).toEqual([
      { date: "2026-09-03", from: "America/New_York", to: "America/Denver" },
    ]);
  });
  it("returns [] for a single-zone trip (Slovenia)", () => {
    expect(legTzChanges(trip)).toEqual([]);
  });
});

describe("kindToV2", () => {
  it("maps each v1 kind", () => {
    expect(kindToV2("meal")).toEqual({ category: "meal", status: "none" });
    expect(kindToV2("todo")).toEqual({ category: "errand", status: "toBook" });
    expect(kindToV2("checkin")).toEqual({ category: "stay", status: "none" });
    expect(kindToV2("booked")).toEqual({ category: "activity", status: "booked" });
  });
  it("falls back to activity/none for unknown kinds", () => {
    expect(kindToV2("mystery")).toEqual({ category: "activity", status: "none" });
  });
});

describe("row <-> object mapping", () => {
  it("rowToTrip hydrates travelers/passes and tolerates nulls", () => {
    const t = rowToTrip({
      id: "t1",
      user_id: "u1",
      name: "Slovenia",
      travelers: [{ name: "Chris" }],
      passes: [{ id: "p" }],
    });
    expect(t).toMatchObject({ id: "t1", userId: "u1", name: "Slovenia" });
    expect(t.travelers).toHaveLength(1);
    expect(t.passes).toHaveLength(1);
  });
  it("tripToRow omits entries (they live in trip_entries)", () => {
    expect(tripToRow({ name: "X", entries: [{ id: "e" }] })).not.toHaveProperty("entries");
  });
  it("entry round-trips id/day/sort as columns, rest as payload", () => {
    const row = {
      id: "x",
      trip_id: "t",
      day: "2026-05-19",
      sort: 3,
      payload: { category: "meal", title: "Dinner" },
    };
    const e = rowToEntry(row);
    expect(e).toEqual({ id: "x", day: "2026-05-19", sort: 3, category: "meal", title: "Dinner" });
    const back = entryToRow("t", e);
    expect(back).toMatchObject({
      trip_id: "t",
      day: "2026-05-19",
      sort: 3,
      payload: { category: "meal", title: "Dinner" },
    });
  });
});

describe("taxonomy constants", () => {
  it("expose the v2 axes", () => {
    expect(ENTRY_CATEGORIES).toEqual(["travel", "meal", "activity", "stay", "errand"]);
    expect(ENTRY_STATUSES).toEqual(["none", "toBook", "reserved", "booked"]);
  });
});

describe("defensive edges", () => {
  it("rowToTrip / rowToEntry return null for a null row", () => {
    expect(rowToTrip(null)).toBe(null);
    expect(rowToEntry(null)).toBe(null);
  });
  it("rowToTrip coerces a Date start_date (pg pooler) to YYYY-MM-DD", () => {
    const t = rowToTrip({
      id: "t",
      start_date: new Date(2026, 4, 18),
      end_date: new Date(2026, 4, 20),
    });
    expect(t.startDate).toBe("2026-05-18");
    expect(t.endDate).toBe("2026-05-20");
  });
  it("rowToTrip falls back to empty collections on a sparse row", () => {
    const t = rowToTrip({ id: "t" });
    expect(t).toMatchObject({
      legs: [],
      options: {},
      travelers: [],
      passes: [],
      entries: [],
      glance: {},
    });
  });
  it("entryToRow omits id when absent and defaults day/sort", () => {
    const row = entryToRow("t1", { category: "meal", title: "X" });
    expect(row).not.toHaveProperty("id");
    expect(row).toMatchObject({ trip_id: "t1", day: null, sort: 0 });
  });
  it("tripToRow tolerates a bare trip object", () => {
    expect(tripToRow({})).toMatchObject({
      user_id: null,
      name: "",
      legs: [],
      travelers: [],
      passes: [],
    });
  });
  it("tripDays falls back to glance.tz when a leg has none", () => {
    const days = tripDays({
      startDate: "2026-05-18",
      endDate: "2026-05-18",
      glance: { tz: "America/New_York" },
      legs: [],
    });
    expect(days[0].tz).toBe("America/New_York");
    expect(days[0].cityId).toBe(null);
  });
  it("entryStartMinutes handles v1 string, v1 {start}, range and missing time", () => {
    // imported transitively through entriesByDay ordering
    const by = entriesByDay({
      entries: [
        { id: "vstr", day: "d", time: "08:30" }, // v1 string
        { id: "vobj", day: "d", time: { start: "07:15" } }, // v1 {start}
        { id: "rng", day: "d", time: { mode: "range", start: "09:00" } },
        { id: "none", day: "d" }, // no time → last
      ],
    });
    expect(by["d"].map((e) => e.id)).toEqual(["vobj", "vstr", "rng", "none"]);
  });
  it("cashNeeded skips entries with no cost at all", () => {
    expect(cashNeeded({ entries: [{ title: "no cost" }] })).toEqual({});
  });
});
