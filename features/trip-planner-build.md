# Trip Planner — the build (living doc)

> Issue #39. The living record of the Trip Planner _implementation_ (epic #7).
> The **design** is in `trip-planner-components.md` / `-ux.md` / `-systems.md`;
> this tracks what's built, how the pieces connect, and what's left. (Named
> `-build` because `trip-planner.md` is the older swim-lane year-view feature —
> the naming collision flagged in #39 is resolved by this separate file.)

## What it is

Replaces Janice's hand-built ~100-cell hour-grid. The human **Gathers** wants +
**Blocks** big rocks into days; the machine **Solves** — orders each day,
computes travel, slots meals/buffers, emits the grid. Multi-city, real-time
co-edited, Supabase-backed.

## Architecture (as built)

```
app/trips/layout.js  → TripProvider (components/TripProvider.jsx)
  /trips              → TripsIndex (list + TripComposer)
  /trips/[id]         → TripDetail (orchestrator)
                          ├─ DayPlan (agenda) ⇄ GridView      ← views over one model
                          │    └─ EntryCard ← TimeChip/BookingBadge/MarkerSet/PlaceRef
                          ├─ EntryEditor (side sheet, full v2 atom)
                          ├─ TransportSection · DayMap
                          ├─ GatherPanel (buildPool over cached pois)
                          └─ BookPanel (derived: ledger/cash/passes)
lib/trip.js          → v2 atom + helpers (pure)         ← the contract
lib/trip-merge.js    → real-time merge (pure)           ← #36
lib/solve.js         → day solver        lib/solve-adapter.js → v2 ↔ solver
lib/sourcing.js      → Gather pool       lib/place-resolve.js → Google place_id
lib/db.js            → the only getSupabase() caller; trips + trip_entries + pois
supabase/migrations  → 0016 trip_entries (RLS+realtime), 0017 travelers/passes
```

## Data flow

- **Read:** `TripProvider` mounts → `fetchMyTrips`; opening a trip →
  `fetchTrip` (frame + hydrated `trip_entries`) + `subscribeTrip`.
- **Write:** debounced per-entry (`upsertEntry`) + per-frame (`updateTrip`);
  drag/solve land entries via `updateEntry`. `lib/db.js` is the sole DB caller.
- **Real-time:** `subscribeTrip` → `lib/trip-merge.js` (own-echo suppression +
  per-entry LWW).

## Architecture Decision Records (#46)

1. **ADR-1 — Entries normalized into `trip_entries`** (not a blob). Forced by
   real-time: one blob means whole-array rewrites clobber concurrent writers.
   One row per entry → per-entry patches + conflict isolation. (migration 0016.)
2. **ADR-2 — Real-time = per-entry LWW + timestamp-guarded own-echo
   suppression** (not per-field/CRDT). Two trusted editors, low contention;
   the normalization already removed the dangerous failure mode. Full rationale
   - the two-session proof: `features/trip-realtime-merge.md`.
3. **ADR-3 — Times stored wall-clock-local + IANA tz, never UTC** — so a "9:00
   AM" can't drift across DST / a year-shift. `features/trip-timezones.md`.
4. **ADR-4 — Domain logic in `lib/` (pure, tested); components thin; `lib/db.js`
   the sole Supabase caller** — the project's standing convention, applied here
   so the engines stay unit-testable and isomorphic.
5. **ADR-5 — Entry atom v2: orthogonal `category`×`status`** (not the v1 `kind`
   enum). What-it-is vs how-committed are different axes. `trip-planner-
components.md` §3.

## Status (2026-06-11)

**Built + verified-here (build/lint/tests):** the model layer (#8–#11, #36, #37,
#42), the engines/adapter (#27), place-resolve (#13), the full `/trips` UI
(#12, #15–#21, #23, #25–#33), CI/test/lint/typecheck (#40, #41, #45, #48, #52).
**Written, runs on the Mac:** the Slovenia v1→v2 migration (#14), the two
migrations (#8/#9, apply in the SQL editor).
**Cannot verify in the sandbox:** anything needing live Supabase (auth, RLS,
real-time co-editing) or the Google Places key (live resolution) — built to
compile + match proven patterns, validated by the unit suites where pure.

## Follow-ups (tracked as GitHub issues)

- **#22** TripWindow calendar-strip drag · **#24** StaySection · **#34**
  variations/fork · **#35** mobile · **#38** a11y audit · **#44** E2E (browser
  blocked in sandbox) · **#47** godfile split · **#49** perf · **#50** security
  review · **#51** error/observability (boundary landed; retry/reconnect TODO).
