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

// Entries visible given each fork's active choice: base entries always; a
// tagged entry only when its fork's active choice matches (an orphan tag whose
// fork no longer exists is shown, never silently dropped).
export function activeEntries(trip) {
  const forks = tripForks(trip);
  if (!forks.length) return trip?.entries || [];
  const activeByFork = new Map(forks.map((f) => [f.id, f.activeChoiceId]));
  return (trip.entries || []).filter((e) => {
    const o = e.option;
    if (!o) return true;
    if (!activeByFork.has(o.forkId)) return true;
    return activeByFork.get(o.forkId) === o.choiceId;
  });
}

// Entries tagged to one choice of a fork, sorted by day — for the compare view.
export function entriesForChoice(trip, forkId, choiceId) {
  return (trip?.entries || [])
    .filter((e) => e.option?.forkId === forkId && e.option?.choiceId === choiceId)
    .sort((a, b) => (a.day || "").localeCompare(b.day || ""));
}

// Count of entries tagged to each choice of a fork: { [choiceId]: n }.
export function choiceCounts(trip, forkId) {
  const out = {};
  for (const e of trip?.entries || []) {
    if (e.option?.forkId === forkId) out[e.option.choiceId] = (out[e.option.choiceId] || 0) + 1;
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
