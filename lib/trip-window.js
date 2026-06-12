// Trip-window leg math (#22) — the pure, testable core behind the draggable
// calendar strip. Moving the boundary between two date-adjacent legs
// redistributes days between them; the trip's start/end never move and only the
// two touching legs change. Kept out of the component so the clamp + date
// arithmetic (the riskiest part of the drag) can be unit-tested without a DOM.
const DAY_MS = 86400000;

export function parseYmd(s) {
  const m = (s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(ymd, n) {
  const d = parseYmd(ymd);
  return d ? fmt(new Date(d.getTime() + n * DAY_MS)) : ymd;
}
export function daysBetween(a, b) {
  const x = parseYmd(a), y = parseYmd(b);
  return x && y ? Math.round((y - x) / DAY_MS) : 0;
}

// Two legs share a movable boundary only when they're date-adjacent
// (leg.depart + 1 day === next.arrive). Returns the indices i of such legs.
export function legBoundaries(legs) {
  const out = [];
  for (let i = 0; i < (legs?.length || 0) - 1; i++) {
    if (addDays(legs[i].depart, 1) === legs[i + 1].arrive) out.push(i);
  }
  return out;
}

// Clamp a raw day-shift so neither touching leg drops below one day. Positive
// shift grows the left leg (takes days from the right); negative does the
// reverse. Returns 0 for a non-adjacent or out-of-range boundary.
export function clampShift(legs, i, raw) {
  const left = legs?.[i], right = legs?.[i + 1];
  if (!left || !right) return 0;
  if (addDays(left.depart, 1) !== right.arrive) return 0;
  const leftSpan = daysBetween(left.arrive, left.depart) + 1;
  const rightSpan = daysBetween(right.arrive, right.depart) + 1;
  return Math.max(-(leftSpan - 1), Math.min(rightSpan - 1, raw));
}

// Apply a (clamped) shift to boundary i. Returns { legs, shift } — `legs` is a
// new array (unchanged when shift clamps to 0), `shift` the day-count applied.
export function shiftLegBoundary(legs, i, raw) {
  const s = clampShift(legs, i, raw);
  if (!s) return { legs, shift: 0 };
  const next = legs.map((l, k) =>
    k === i ? { ...l, depart: addDays(l.depart, s) }
    : k === i + 1 ? { ...l, arrive: addDays(l.arrive, s) }
    : l);
  return { legs: next, shift: s };
}
