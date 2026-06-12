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

// An entry is PINNED at its time if it's booked/reserved and carries a start.
function fixedTimeOf(e) {
  const t = e.time || {};
  const start = t.mode === "range" ? t.start : t.mode === "point" ? t.at : null;
  return start && (e.status === "booked" || e.status === "reserved") ? start.slice(0, 5) : null;
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

// Solve a day's entries. Returns { times: { [entryId]: {start,end} }, flags, feasible }.
// `lodging` = { lat, lon, name } | null (the leg's stay). Only entries that map
// to a placed anchor get a time back; travel/stay entries are left as-is.
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
  for (const r of result.entries || []) {
    // Solve carries the anchor id through on placed anchors (not on generated
    // travel/free blocks). Map start/end back to the entry's v2 time.
    if (r.id && r.start && r.end) times[r.id] = { start: r.start, end: r.end };
  }
  return { times, flags: result.flags || [], feasible: result.feasible !== false };
}
