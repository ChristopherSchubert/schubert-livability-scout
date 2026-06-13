// solve-adapter (#27) — maps v2 trip entries ⇄ lib/solve.js's solveDay, so the
// "Solve day" action can lay loosely-timed / bucket entries into a clocked,
// travel-aware schedule. Booked entries with a time are PINNED (fixedTime);
// everything else floats and Solve places it. Travel legs are stay/connective
// and aren't fed in (Solve generates travel between anchors).
import { solveDay } from "./solve.js";

const DEFAULT_DUR = { meal: 75, activity: 90, errand: 30, stay: 0, travel: 0 };

function toMin(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function durationOf(e) {
  const t = e.time || {};
  if (t.mode === "range" && t.start && t.end) {
    const d = toMin(t.end) - toMin(t.start);
    if (d > 0) return d;
  }
  return DEFAULT_DUR[e.category] ?? 60;
}

// An entry is PINNED at its time when:
//   (a) e.pinned is explicitly true AND a start time is present (explicit pin, first-class), OR
//   (b) booked/reserved with a start time (kept for backwards compat — a booking implies a fixed slot).
// Pinned means the solver must not move it: it becomes a fixedTime anchor.
export function fixedTimeOf(e) {
  const t = e.time || {};
  const start = t.mode === "range" ? t.start : t.mode === "point" ? t.at : null;
  if (!start) return null;
  if (e.pinned) return start.slice(0, 5);
  if (e.status === "booked" || e.status === "reserved") return start.slice(0, 5);
  return null;
}

function entryToAnchor(e) {
  return {
    id: e.id,
    title: e.title || "Untitled",
    durationMin: durationOf(e),
    location: e.place && e.place.lat != null ? { lat: e.place.lat, lon: e.place.lon } : null,
    fixedTime: fixedTimeOf(e),
    kind: e.category === "meal" ? "meal" : undefined,
  };
}

// Solve a day's entries. Returns:
//   times:    { [entryId]: {start,end} }  — clock times for each persisted anchor
//   schedule: ordered array of all blocks, including generated connective rows:
//             anchors carry their entry id; connectives carry a synthetic key
//             (__gen_<i>), generated:true, and a kind (travel|flexible) + label.
//             Connective rows are VIEW-ONLY — they are never persisted.
//   flags:    solver warnings (over-packed, collisions)
//   feasible: boolean
//
// Approach B (see TripWorkspace.jsx): solveTripDay stores the full ordered
// schedule in component state after a solve; TripWorkspace renders the
// connective rows between persisted anchor rows in one interleaved pass.
// This is least invasive to the existing DayEntries dnd list — DayEntries
// still receives only the persisted list (for drag + drop reorder), while
// TripWorkspace renders the agenda view from `schedule` when one exists.
export function solveTripDay(dayEntries, { lodging = null, dayStart = "07:00", dayEnd = "23:00" } = {}) {
  const placeable = dayEntries.filter((e) => e.category !== "travel" && e.category !== "stay");
  const anchors = placeable.map(entryToAnchor);
  const result = solveDay({
    lodging, dayStart, dayEnd, anchors,
    mealWindows: [
      { name: "Lunch", from: "12:00", to: "14:00", durationMin: 75 },
      { name: "Dinner", from: "18:30", to: "21:00", durationMin: 90 },
    ],
  });

  const times = {};
  const schedule = [];

  for (let i = 0; i < (result.entries || []).length; i++) {
    const r = result.entries[i];
    if (r.id && r.start && r.end) {
      // Placed anchor: map time back to the entry and add to the agenda.
      times[r.id] = { start: r.start, end: r.end };
      schedule.push({ ...r }); // carries id, start, end, kind, role, title
    } else {
      // Generated connective block (travel leg, buffer, free, generic meal).
      // Give it a synthetic key so React can key it; mark generated:true so
      // the view can style + gate it without an id look-up.
      schedule.push({
        ...r,
        key: `__gen_${i}`,
        generated: true,
      });
    }
  }

  return { times, schedule, flags: result.flags || [], feasible: result.feasible !== false };
}
