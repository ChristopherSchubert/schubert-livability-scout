// Real-time merge (issues #36, #42) — the per-entry LWW + own-echo suppression
// strategy from features/trip-realtime-merge.md, extracted as PURE functions so
// the riskiest bit of the provider is unit-tested instead of trapped in React.
// TripProvider (#12) wires these to the Supabase channel.

// Should this incoming change be ignored as our own echo? True iff it's an
// insert/update for an entry we have an in-flight write for (same id, present in
// `pending`). DELETEs are never suppressed (a remote delete must always apply).
export function isOwnEcho(change, pending) {
  if (change.table !== "trip_entries" || !change.id) return false;
  if (change.eventType === "DELETE") return false;
  return pending.has(change.id);
}

// Apply a (non-suppressed) entry change to the local entries array. Per-entry
// last-write-wins: insert appends, update replaces by id, delete removes.
export function applyEntryChange(entries, change) {
  if (change.eventType === "DELETE") {
    return entries.filter((e) => e.id !== change.id);
  }
  const e = change.entry;
  if (!e) return entries;
  const i = entries.findIndex((x) => x.id === e.id);
  if (i === -1) return [...entries, e];
  return entries.map((x) => (x.id === e.id ? e : x));
}

// The full merge step: suppress own echoes, else apply. Returns the (possibly
// unchanged) entries array — referential identity is preserved on a no-op so
// React can skip the re-render.
export function mergeEntryChange(entries, change, pending) {
  if (isOwnEcho(change, pending)) return entries;
  return applyEntryChange(entries, change);
}
