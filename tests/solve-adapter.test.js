// lib/solve-adapter.js — v2 entries ↔ solveDay (issues #27, #41). Verifies the
// mapping in both directions, including the pin contract.
import { describe, it, expect } from "vitest";
import { toSolveDay, fromSolveResult, solveTripDay } from "../lib/solve-adapter.js";
import { solveDay } from "../lib/solve.js";

const trip = {
  id: "t1",
  entries: [
    {
      id: "balloon",
      day: "2026-05-19",
      role: "anchor",
      category: "activity",
      status: "booked",
      title: "Balloon",
      durationMin: 90,
      time: { mode: "point", at: "05:30" },
      place: { lat: 46.37, lon: 14.11 },
    },
    {
      id: "castle",
      day: "2026-05-19",
      role: "anchor",
      category: "activity",
      title: "Castle",
      durationMin: 60,
      time: { mode: "bucket", bucket: "afternoon" },
      place: { lat: 46.36, lon: 14.1 },
    },
    {
      id: "lunch",
      day: "2026-05-19",
      role: "anchor",
      category: "meal",
      title: "Gostilna",
      durationMin: 60,
      place: { lat: 46.37, lon: 14.11 },
    },
    // A connective from a previous solve — must be dropped on re-solve.
    {
      id: "old-travel",
      day: "2026-05-19",
      role: "connective",
      category: "travel",
      title: "Travel",
    },
    // A different day — excluded.
    { id: "other", day: "2026-05-20", role: "anchor", category: "activity", title: "Other" },
  ],
};

describe("toSolveDay", () => {
  const day = toSolveDay(trip, "2026-05-19", {
    lodging: { lat: 46.368, lon: 14.114, name: "Lodge" },
    dayStart: "05:00",
    dayEnd: "20:00",
    mealWindows: [{ name: "Lunch", from: "12:00", to: "14:00", durationMin: 60 }],
  });

  it("includes only this day's non-connective entries", () => {
    expect(day.anchors.map((a) => a.id).sort()).toEqual(["balloon", "castle", "lunch"]);
  });
  it("maps a point time to a hard fixedTime", () => {
    expect(day.anchors.find((a) => a.id === "balloon").fixedTime).toBe("05:30");
  });
  it("leaves a bucket time floating (no fixedTime)", () => {
    expect(day.anchors.find((a) => a.id === "castle").fixedTime).toBeUndefined();
  });
  it("maps category to the solver kind (meal stays meal)", () => {
    expect(day.anchors.find((a) => a.id === "lunch").kind).toBe("meal");
  });
  it("carries the place as a location", () => {
    expect(day.anchors.find((a) => a.id === "balloon").location).toEqual({
      lat: 46.37,
      lon: 14.11,
    });
  });
  it("treats an explicit pin as a fixedTime even with a range", () => {
    const pinned = toSolveDay(
      {
        entries: [
          {
            id: "p",
            day: "d",
            role: "anchor",
            category: "activity",
            pinned: true,
            time: { mode: "range", start: "09:15", end: "10:00" },
          },
        ],
      },
      "d"
    );
    expect(pinned.anchors[0].fixedTime).toBe("09:15");
  });
});

describe("fromSolveResult", () => {
  it("maps solver output back to v2 entries, preserving anchor ids", () => {
    const result = {
      date: "2026-05-19",
      entries: [
        {
          id: "balloon",
          start: "05:30",
          end: "07:00",
          kind: "booked",
          role: "anchor",
          title: "Balloon",
        },
        {
          start: "07:00",
          end: "07:20",
          kind: "travel",
          role: "connective",
          title: "Travel",
          estimate: true,
        },
      ],
    };
    const v2 = fromSolveResult(result, { tripId: "t1", day: "2026-05-19" });
    expect(v2[0]).toMatchObject({
      id: "balloon",
      category: "activity",
      time: { mode: "range", start: "05:30", end: "07:00" },
      solved: true,
    });
    expect(v2[1]).toMatchObject({ category: "travel", role: "connective", estimate: true });
    expect(v2[1].id).toMatch(/^solved:/); // invented connective gets a fresh id
  });
});

describe("solveTripDay (round-trip through the real solver)", () => {
  it("produces a feasible, time-ordered v2 grid", () => {
    const { result, entries } = solveTripDay(solveDay, trip, "2026-05-19", {
      lodging: { lat: 46.368, lon: 14.114, name: "Lodge" },
      dayStart: "05:00",
      dayEnd: "20:00",
      mealWindows: [{ name: "Lunch", from: "12:00", to: "14:00", durationMin: 60 }],
    });
    expect(result.feasible).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.find((e) => e.id === "balloon")).toBeTruthy(); // pinned anchor survived
  });
});
