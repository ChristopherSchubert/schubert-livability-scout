// Solve adapter (issue #27) — the bridge between the v2 entry atom (lib/trip.js)
// and the day solver's shape (lib/solve.js#solveDay). Pure + isomorphic, so it's
// fully unit-testable (the part of #41 that was waiting on this). Two directions:
//
//   toSolveDay(trip, date, opts)   v2 entries → a `day` for solveDay
//   fromSolveResult(result, meta)  solveDay output → v2 entries (the grid)
//
// Pins: a `point` time or an explicit `entry.pinned` is a HARD constraint — it
// becomes a `fixedTime` so Solve places it exactly there and flows around it
// (the EntryEditor's "editing a solved time auto-pins" rule, spec §4.4b).

import { entryStartMinutes } from "./trip.js";

// v2 category → the kind solveDay keys behaviors off (meal windows, colors).
const CATEGORY_TO_SOLVE_KIND = {
  meal: "meal",
  travel: "travel",
  stay: "checkin",
  errand: "todo",
  activity: "booked",
};
// Inverse, for mapping Solve's emitted entries back to the v2 atom.
const SOLVE_KIND_TO_V2 = {
  meal: { category: "meal" },
  travel: { category: "travel" },
  checkin: { category: "stay" },
  todo: { category: "errand" },
  booked: { category: "activity" },
  flexible: { category: "activity" }, // free / buffer — a connective filler
};

const DEFAULT_DURATION = { meal: 60, activity: 90, stay: 30, errand: 30, travel: 20 };

// Is this entry a hard, clock-fixed point Solve must not move?
function fixedTimeOf(entry) {
  const t = entry?.time;
  if (entry?.pinned && t) return minToHHMM(entryStartMinutes(entry));
  if (t?.mode === "point") return minToHHMM(entryStartMinutes(entry));
  return null;
}
function minToHHMM(min) {
  if (min == null) return null;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// Build the `day` object solveDay expects from a trip's entries for one date.
// Connective entries (travel/buffer/free) are Solve's OUTPUT, not its input, so
// they're dropped — re-solving regenerates them. opts carries the day frame the
// trip can't infer alone (lodging pin, day bounds, meal windows).
export function toSolveDay(trip, date, opts = {}) {
  const all = (trip.entries || []).filter((e) => e.day === date);
  const anchors = all
    .filter((e) => e.role !== "connective")
    .map((e) => {
      const fixedTime = fixedTimeOf(e);
      return {
        id: e.id,
        title: e.title || "",
        durationMin: Number(e.durationMin) || DEFAULT_DURATION[e.category] || 60,
        location: e.place?.lat != null ? { lat: e.place.lat, lon: e.place.lon } : null,
        kind: CATEGORY_TO_SOLVE_KIND[e.category] || "booked",
        ...(fixedTime ? { fixedTime } : {}),
      };
    });
  return {
    date,
    lodging: opts.lodging || null,
    dayStart: opts.dayStart || "08:00",
    dayEnd: opts.dayEnd || "22:00",
    anchors,
    mealWindows: opts.mealWindows || [],
  };
}

// Map solveDay's output back into v2 entries (the rendered grid). Anchors keep
// their original id (so pins/edits survive a re-solve); connectives Solve
// invented get fresh ids. Times come back as a `point|range` v2 time.
/**
 * @param {{ entries?: any[], date?: string }} result
 * @param {{ tripId?: string|null, day?: string }} [meta]
 */
export function fromSolveResult(result, { tripId, day } = {}) {
  return (result.entries || []).map((e, i) => {
    const v2 = SOLVE_KIND_TO_V2[e.kind] || { category: "activity" };
    const time =
      e.start && e.end && e.start !== e.end
        ? { mode: "range", start: e.start, end: e.end }
        : { mode: "point", at: e.start };
    return {
      id: e.id || `solved:${day || result.date}:${i}`,
      tripId: tripId || null,
      day: day || result.date,
      role: e.role || "connective",
      category: v2.category,
      status: e.id ? undefined : "none", // invented connectives carry no commitment
      title: e.title || "",
      time,
      sort: i,
      ...(e.estimate ? { estimate: true } : {}),
      solved: true, // marks Solve-authored entries (editing one auto-pins, §4.4b)
    };
  });
}

// Convenience: solve a trip's day end-to-end. Caller supplies solveDay to avoid
// a hard dep cycle and to keep this layer pure (no engine import needed to test
// the mapping in isolation).
export function solveTripDay(solveDay, trip, date, opts = {}) {
  const day = toSolveDay(trip, date, opts);
  const result = solveDay(day);
  return { result, entries: fromSolveResult(result, { tripId: trip.id, day: date }) };
}
