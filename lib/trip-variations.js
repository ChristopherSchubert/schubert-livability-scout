// Trip variations / forks (#34) — the deck's "what if" finale. A fork covers a
// date range and holds 2+ named choices (Option A vs Option B); the same days
// can carry two futures, each with its own entries and refundable bookings,
// kept alive until a `decide-by` (the earliest cancellation deadline). Pure +
// isomorphic so the filtering and decide-by math are unit-tested.
//
// Data model (additive — absent on every existing trip, so a no-op there):
//   trip.options.forks = [{ id, name, range:{from,to}, choices:[{id,label}], activeChoiceId }]
//   entry.option = { forkId, choiceId }   // omitted ⇒ a "base" entry (always shown)

export function tripForks(trip) {
  return trip?.options?.forks || [];
}

// The fork whose date range covers `day` (YYYY-MM-DD), if any.
export function forkForDay(trip, day) {
  if (!day) return null;
  return tripForks(trip).find((f) => f.range?.from <= day && day <= f.range?.to) || null;
}

// Does this untagged entry implicitly belong to fork `f`'s FIRST choice? True
// when the entry has no explicit option but its day falls in the fork's range.
// This is what lets a freshly-forked range need only ONE atomic frame write —
// no per-entry tagging burst that could race the metadata (#62).
function implicitFirstChoice(e, f) {
  return !e.option && e.day && f.range?.from <= e.day && e.day <= f.range?.to;
}

// Entries visible given each fork's active choice: base entries (outside every
// fork) always; an explicitly-tagged entry only when its fork's active choice
// matches; an untagged in-range entry belongs to that fork's first choice (an
// orphan tag whose fork no longer exists is shown, never silently dropped).
export function activeEntries(trip) {
  const forks = tripForks(trip);
  if (!forks.length) return trip?.entries || [];
  const byId = new Map(forks.map((f) => [f.id, f]));
  return (trip.entries || []).filter((e) => {
    if (e.option) {
      const f = byId.get(e.option.forkId);
      if (!f) return true;                       // orphan tag → show
      return f.activeChoiceId === e.option.choiceId;
    }
    const f = forks.find((x) => implicitFirstChoice(e, x));
    if (!f) return true;                         // base entry, always shown
    return f.activeChoiceId === f.choices[0]?.id; // implicit Option A
  });
}

// Entries belonging to one choice of a fork, sorted by day — for the compare
// view. Includes untagged in-range entries for the first choice.
export function entriesForChoice(trip, forkId, choiceId) {
  const fork = tripForks(trip).find((f) => f.id === forkId);
  const isFirst = !!fork && fork.choices[0]?.id === choiceId;
  return (trip?.entries || [])
    .filter((e) =>
      (e.option?.forkId === forkId && e.option?.choiceId === choiceId) ||
      (isFirst && fork && implicitFirstChoice(e, fork)))
    .sort((a, b) => (a.day || "").localeCompare(b.day || ""));
}

// Count of entries belonging to each choice of a fork: { [choiceId]: n }.
// Untagged in-range entries count toward the first choice.
export function choiceCounts(trip, forkId) {
  const fork = tripForks(trip).find((f) => f.id === forkId);
  const first = fork?.choices[0]?.id;
  const out = {};
  for (const e of trip?.entries || []) {
    if (e.option?.forkId === forkId) out[e.option.choiceId] = (out[e.option.choiceId] || 0) + 1;
    else if (fork && implicitFirstChoice(e, fork)) out[first] = (out[first] || 0) + 1;
  }
  return out;
}

// decide-by: the earliest booking cancellation deadline among ANY entry tagged
// to the fork (either choice) — once it passes, the unpicked option's
// refundable holds would be lost, so it's the date to choose by. null if none.
export function forkDecideBy(trip, forkId) {
  const deadlines = (trip?.entries || [])
    .filter((e) => e.option?.forkId === forkId && e.booking?.cancelBy)
    .map((e) => e.booking.cancelBy);
  return deadlines.length ? deadlines.sort()[0] : null;
}

// A fresh two-choice fork over [from, to]. id is supplied by the caller (so this
// stays pure/deterministic); the component stamps it.
export function makeFork(id, name, from, to) {
  return {
    id, name: name || "What-if", range: { from, to },
    choices: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }],
    activeChoiceId: "a",
  };
}

// Set a fork's active choice, returning a NEW options object (immutable).
export function setActiveChoice(options, forkId, choiceId) {
  const forks = (options?.forks || []).map((f) => (f.id === forkId ? { ...f, activeChoiceId: choiceId } : f));
  return { ...(options || {}), forks };
}
