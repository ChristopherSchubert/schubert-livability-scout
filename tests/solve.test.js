// lib/solve.js — the day auto-assembler (issues #41, design in
// features/trip-planner-systems.md §5). Exercises travel math + the greedy
// solver's contract: fixed times are hard, over-pack flags, free time surfaced.
import { describe, it, expect } from "vitest";
import { solveDay, travelMinutes } from "../lib/solve.js";

const at = (lat, lon) => ({ lat, lon });
const lodging = { ...at(46.3683, 14.1146), name: "Bled lodging" };

describe("travelMinutes", () => {
  it("is 0 for missing endpoints", () => {
    expect(travelMinutes(null, at(1, 1))).toBe(0);
    expect(travelMinutes(at(1, 1), null)).toBe(0);
  });
  it("floors a real short walk at 4 minutes, 0 only when co-located", () => {
    // ~150 m apart: round(walk) < 4, so the floor applies.
    expect(travelMinutes(at(46.3683, 14.1146), at(46.3697, 14.1146))).toBe(4);
    expect(travelMinutes(at(46.3683, 14.1146), at(46.3683, 14.1146))).toBe(0);
  });
  it("drives (faster per km) for longer distances", () => {
    const near = travelMinutes(at(46.30, 14.10), at(46.31, 14.10)); // ~1.1km*1.3 -> walk
    const far = travelMinutes(at(46.30, 14.10), at(46.40, 14.10));  // ~11km -> drive
    expect(far).toBeGreaterThan(near);
  });
});

describe("solveDay", () => {
  it("emits a fixed-time anchor at its slot", () => {
    const res = solveDay({
      date: "2026-05-19", lodging, dayStart: "07:00", dayEnd: "20:00",
      anchors: [{ id: "balloon", title: "Balloon", durationMin: 90, location: at(46.37, 14.11), fixedTime: "05:30" }],
      mealWindows: [],
    });
    const balloon = res.entries.find((e) => e.id === "balloon");
    expect(balloon).toBeTruthy();
    expect(balloon.start).toBe("05:30");
    expect(balloon.role).toBe("anchor");
  });

  it("inserts travel legs between placed anchors", () => {
    const res = solveDay({
      date: "d", lodging, dayStart: "08:00", dayEnd: "20:00",
      anchors: [
        { id: "a", title: "Castle", durationMin: 60, location: at(46.39, 14.10) },
        { id: "b", title: "Gorge", durationMin: 60, location: at(46.40, 14.05) },
      ],
      mealWindows: [],
    });
    expect(res.entries.some((e) => e.kind === "travel")).toBe(true);
    expect(res.feasible).toBe(true);
  });

  it("flags a day that is over-packed instead of dropping anchors", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `x${i}`, title: `Thing ${i}`, durationMin: 120, location: at(46.3 + i * 0.05, 14.1),
    }));
    const res = solveDay({ date: "d", lodging, dayStart: "09:00", dayEnd: "17:00", anchors: many, mealWindows: [] });
    expect(res.feasible).toBe(false);
    expect(res.flags.join(" ")).toMatch(/Over-packed/);
  });

  it("flags a hard fixed-time collision", () => {
    const res = solveDay({
      date: "d", lodging, dayStart: "07:00", dayEnd: "20:00",
      anchors: [
        { id: "a", title: "Tour A", durationMin: 120, location: at(46.37, 14.11), fixedTime: "10:00" },
        { id: "b", title: "Tour B", durationMin: 60, location: at(46.37, 14.11), fixedTime: "11:00" },
      ],
      mealWindows: [],
    });
    expect(res.flags.join(" ")).toMatch(/Conflict/);
    expect(res.feasible).toBe(false);
  });

  it("places a chosen restaurant as the meal anchor in its window", () => {
    const res = solveDay({
      date: "d", lodging, dayStart: "08:00", dayEnd: "20:00",
      anchors: [{ id: "rest", title: "Gostilna", durationMin: 60, location: at(46.37, 14.11), kind: "meal" }],
      mealWindows: [{ name: "Lunch", from: "12:00", to: "14:00", durationMin: 60 }],
    });
    const meal = res.entries.find((e) => e.kind === "meal");
    expect(meal).toBeTruthy();
    expect(meal.title).toBe("Gostilna");
    expect(meal.role).toBe("anchor");
  });

  it("surfaces leftover time as free, never hidden", () => {
    const res = solveDay({
      date: "d", lodging, dayStart: "08:00", dayEnd: "22:00",
      anchors: [
        { id: "a", title: "Short", durationMin: 30, location: at(46.37, 14.11) },
        { id: "z", title: "Evening", durationMin: 30, location: at(46.37, 14.11), fixedTime: "20:00" },
      ],
      mealWindows: [],
    });
    expect(res.entries.some((e) => e.kind === "flexible" && /Free/.test(e.title))).toBe(true);
  });

  it("returns entries sorted by start time", () => {
    const res = solveDay({
      date: "d", lodging, dayStart: "07:00", dayEnd: "20:00",
      anchors: [
        { id: "late", title: "Late", durationMin: 30, location: at(46.37, 14.11), fixedTime: "18:00" },
        { id: "early", title: "Early", durationMin: 30, location: at(46.37, 14.11), fixedTime: "09:00" },
      ],
      mealWindows: [],
    });
    const times = res.entries.map((e) => e.start);
    expect([...times]).toEqual([...times].sort());
  });

  it("uses default day bounds when omitted", () => {
    const res = solveDay({ date: "d", lodging, anchors: [], mealWindows: [] });
    expect(res.feasible).toBe(true);
    expect(res.entries).toEqual([]);
  });
});
