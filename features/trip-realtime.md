# Trip real-time co-editing — merge strategy (#36 spike, resolved)

How two travelers (Janice + Chris) edit one trip live without clobbering each
other. **Resolved by implementation** in [TripProvider](../components/TripProvider.jsx)
+ [lib/db.js](../lib/db.js) `subscribeTrip`.

## The model: per-entry last-write-wins, with own-echo suppression

The win that made this tractable was **normalizing entries into their own rows**
(`trip_entries`, migration 0016) instead of one `entries` jsonb blob. Against a
blob, every edit rewrites the whole array and concurrent writers
last-write-wins-clobber the *entire day*. Per-row, the unit of conflict shrinks
to a single entry — editing the balloon never touches lunch.

So the strategy is deliberately simple and good enough:

1. **Subscribe** — `subscribeTrip(id, onChange)` opens a Supabase
   `postgres_changes` channel filtered to this trip's `trip_entries` (and the
   `trips` frame row). Inserts/updates/deletes arrive as events.
2. **Per-entry LWW** — an incoming change replaces that entry in local state
   (`upsertLocal`), keyed by id. Different entries never conflict. Two people
   editing the *same* entry within the same debounce window resolve to whoever
   wrote last — acceptable for a 2-person trip; no CRDT needed.
3. **Own-echo suppression (the crux)** — every local write stamps
   `ownWrites.current[id] = now`. When a remote change arrives for an id we
   wrote within `ECHO_MS` (4 s), it's **skipped** — our optimistic state is
   already correct, and re-applying the echo would jump the cursor or revert a
   newer keystroke. This is what keeps live typing from fighting the round-trip.
4. **Debounced writes** — `updateEntry`/`updateTripFrame` accumulate per-id
   patches and flush after 600 ms, so Supabase sees one write per gesture.

## Why this is sufficient (and where it isn't)

- **Sufficient:** the real workload is two people dividing a trip — they edit
  *different* entries almost always. Per-entry isolation + echo suppression
  covers it cleanly with no merge library.
- **Not handled (documented limits):** simultaneous edits to the *same field of
  the same entry* are LWW (last writer wins the field) — no character-level
  merge. Offline edits aren't queued. Realtime **reconnect backoff** is the
  channel's default (a manual resync-on-reconnect is a follow-up).

## If it ever needs more

Escalation path, only if same-entry contention becomes real: move to field-level
LWW (per-key timestamps in the payload) before reaching for a CRDT. Not needed
at this scale.
