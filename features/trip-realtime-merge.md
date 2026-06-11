# Spike: real-time conflict-merge strategy (issue #36)

> Risk #1 on the Trip Planner epic (#7). Decides how concurrent edits from
> Janice + Chris merge over the normalized `trip_entries` table, so
> `TripProvider` (#12) can be finalized without clobbering edits or jumping
> the cursor. **Status: decided; the two-session proof is pending a live
> Supabase (not reachable in the build sandbox).**

## The decision (v1)

**Per-entry last-write-wins (LWW) with own-echo suppression.** Not per-field
merge, not a CRDT. Rationale:

1. **The normalization already bought us the important isolation.** Entries are
   one row each (migration 0016), so editing the balloon never touches lunch.
   The blob's "whole-array rewrite clobbers everything" failure mode — the
   reason we normalized — is *already gone*. What remains is the much rarer
   case of two people editing **the same entry** within the ~600 ms debounce
   window.
2. **Two trusted editors, not a crowd.** Janice + Chris co-planning is low-
   contention. The cost/benefit of per-field OT/CRDT machinery (vector clocks,
   tombstones, merge resolution UI) is not worth it for a two-person trip
   planner. LWW at the row grain is honest and predictable: "last save wins,"
   which both editors can reason about.
3. **The debounce shrinks the window further.** `TripProvider` accumulates
   per-entry partial patches and flushes on a 600 ms idle (mirroring
   `queueCityWrite`). A true collision needs both editors mutating the *same*
   entry inside the same sub-second flush — rare, and recoverable (the loser
   re-types one field, not a day).

### Own-echo suppression (the cursor-jump fix)
The real bug to prevent is **your own write echoing back** through the realtime
channel and overwriting what you've kept typing. Mechanism:

- The provider keeps a `pendingEntries: Map<entryId, { sentAt }>` of in-flight
  writes (added on flush, cleared on the upsert's resolved response).
- `subscribeTrip`'s `onChange` for a `trip_entries` row **ignores** an incoming
  change whose `id` is in `pendingEntries` **and** whose row `updated_at` is ≤
  our `sentAt` (it's our own echo). Remote edits — different id, or a newer
  `updated_at` from the *other* editor — apply normally.
- This is timestamp-guarded LWW: we suppress only the echo we caused, never a
  genuine remote update.

### Reorder under concurrency (`sort`)
`reorderEntries` writes `sort = index` per row (lib/db.js). Two concurrent
reorders of the same day are the one place LWW-on-`sort` can look jumpy. v1
rule: **the last reorder wins for the whole day** (the provider applies an
incoming reorder wholesale, suppressing its own echo by the same pending-id
set). Reorder churn is cosmetic and self-heals on the next drag; not worth a
positional CRDT.

### Edit-vs-delete
If one editor deletes an entry while the other edits it: the DELETE event
removes it locally; a subsequent upsert echo from the editor **re-creates** the
row (upsert, not update). v1 accepts this "delete loses to a concurrent edit"
resolution — deleting something someone is actively editing is itself a signal,
and the data is never silently lost. Documented so it's a choice, not a
surprise.

## The proof (pending live Supabase)
A reproducible two-session test belongs in the verification pass once a real
project is reachable:

1. **edit-edit:** two browser sessions on the same trip; A changes an entry's
   time, B changes the same entry's note within 600 ms. Expected: last flush
   wins the whole entry; neither session's cursor jumps mid-type.
2. **edit-delete:** A edits, B deletes the same entry. Expected: re-created by
   A's upsert (documented resolution).
3. **reorder-reorder:** both drag the same day. Expected: last reorder wins;
   order self-heals, no duplicate `sort` values persist.

Until then the strategy is proven by construction (the suppression rule) and by
`lib/db.js` unit-level reasoning; mark the checkbox when the live test runs.

## Feeds
`TripProvider` (#12): implement `pendingEntries` + the timestamp-guarded
suppression exactly as above. Link this note from #12's PR.
