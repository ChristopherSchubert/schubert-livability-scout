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

// Append a new city leg to an existing trip by taking 1 calendar day from the
// longest leg. Returns { legs, error } where error is a string when the add
// cannot proceed ("no nights free — extend the trip first").
//
// "Nights" in this model = calendar days in a leg (inclusive arrive..depart).
// A leg with arrive === depart spans 1 calendar day (minimum). A leg must span
// ≥ 2 calendar days (daysBetween(arrive, depart) ≥ 1) to donate.
//
// Rules:
//   • The trip's startDate..endDate span NEVER moves.
//   • The new leg gets exactly 1 calendar day: arrive = depart = donor's
//     original last day.
//   • The donor (longest leg by daysBetween) loses its last calendar day
//     (depart − 1 day). Contiguity: donor.new_depart + 1 = new_leg.arrive ✓.
//   • All legs are sorted by arrive and re-knit so the sequence stays
//     contiguous (each leg's depart + 1 === next leg's arrive) and covers
//     startDate..endDate with no gap or overlap.
//   • When the trip currently has ZERO legs the new leg takes the whole window.
//
// Signature:
//   appendCityLeg(legs, { cityId, name, lat?, lon? }, startDate, endDate)
//     → { legs: Leg[], error?: string }
export function appendCityLeg(legs, city, startDate, endDate) {
  const { cityId = null, name = "", lat = null, lon = null } = city || {};

  // Empty trip: the first city gets the whole window.
  if (!legs || legs.length === 0) {
    if (!startDate || !endDate) return { legs, error: "trip has no dates" };
    return {
      legs: [{ cityId, name, lat, lon, arrive: startDate, depart: endDate }],
    };
  }

  // Find the longest leg by calendar-day span (daysBetween = span − 1).
  // A leg must have daysBetween ≥ 1 (span ≥ 2 days) to be a valid donor.
  let donorIdx = -1;
  let donorSpan = 0;
  for (let i = 0; i < legs.length; i++) {
    const span = daysBetween(legs[i].arrive, legs[i].depart);
    if (span > donorSpan) { donorSpan = span; donorIdx = i; }
  }

  if (donorIdx === -1 || donorSpan < 1) {
    return { legs, error: "no nights free — extend the trip first" };
  }

  // The new leg takes the donor's last calendar day.
  const donor = legs[donorIdx];
  const newLegDay = donor.depart;               // the day donated
  const donorNewDepart = addDays(donor.depart, -1); // donor loses its last day

  const newLeg = { cityId, name, lat, lon, arrive: newLegDay, depart: newLegDay };

  // Rebuild: updated donor + new leg, sorted by arrive date.
  const rebuilt = legs.map((l, i) =>
    i === donorIdx ? { ...l, depart: donorNewDepart } : l
  );
  rebuilt.push(newLeg);
  rebuilt.sort((a, b) => (a.arrive < b.arrive ? -1 : a.arrive > b.arrive ? 1 : 0));

  // Reknit: walk pairwise and enforce next.arrive = addDays(prev.depart, 1).
  // This handles any ordering artifact from the insert.
  const knit = rebuilt.slice();
  for (let i = 0; i < knit.length - 1; i++) {
    const expected = addDays(knit[i].depart, 1);
    if (knit[i + 1].arrive !== expected) {
      knit[i + 1] = { ...knit[i + 1], arrive: expected };
    }
  }

  return { legs: knit };
}
