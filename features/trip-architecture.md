# Trip Planner — architecture review + ADRs (#46, #49)

The decisions behind the live `/trips` feature, why they were made, and a perf
read. Companion to [trip-planner-app.md](trip-planner-app.md) (the map of what's
built) and [trip-realtime.md](trip-realtime.md) (the merge strategy in depth).

## ADRs (architecture decision records)

### ADR-1 — Entries are rows, not a blob
**Decision:** store entries one-row-per-entry in `trip_entries`, not as a jsonb
array on `trips`. **Why:** real-time co-editing against a blob means every edit
rewrites the whole array and concurrent writers clobber the *entire day*; per-row
shrinks the conflict unit to one entry and gives clean partial patches + a
realtime channel filtered to the trip. **Cost:** a join on read (`fetchTrip`
hydrates frame + entries). **Status:** shipped (migration 0016).

### ADR-2 — `lib/db.js` is the only Supabase caller
**Decision:** every read/write funnels through `lib/db.js`; components never call
`getSupabase()`. **Why:** one place owns the camelCase↔snake mapping
(`TRIP_COL`/`entryToRow`), RLS assumptions, and the realtime channel — the trip
helpers mirror the city/survey ones exactly. **Status:** shipped.

### ADR-3 — A parallel `TripProvider`, not one mega-context
**Decision:** trips get their own provider next to `PlannerProvider`, not bolted
on. **Why:** the trip domain has real-time + debounced co-editing the city domain
doesn't; mixing them would bloat one context. They compose (TripProvider mounts
inside PlannerProvider so trip UI can still read scout cities). **Status:** shipped.

### ADR-4 — v2 entry atom: category × status, structured time/cost/place
**Decision:** an entry is `{category, status, time:{mode}, place:{placeId,...},
cost:{...}, booking}` — not a freeform `kind`. **Why:** category drives icons +
solve behaviour; status drives the booking ledger; `place.placeId` is the single
identity that feeds the map, solve's travel math, and dedup. **Status:** shipped;
the Slovenia trip migrated to it.

### ADR-5 — Place identity is a Google `place_id` or honest null
**Decision:** every located entry resolves to a `place_id` (the pois-cache key)
or `null` — never a fabricated coord. **Why:** the project's founding rule; one
identity keys the map + travel math; null is honest ("happens somewhere we
couldn't pin"). **Status:** shipped (lib/place-resolve.js; 12/79 Slovenia entries
resolved, rest honestly null).

### ADR-6 — Real-time = per-entry LWW + own-echo suppression
See [trip-realtime.md](trip-realtime.md). No CRDT; entry isolation makes simple
LWW sufficient for two travelers. **Status:** shipped.

### ADR-7 — Measurement on free OSM; Google only for trip-planning UX
A head-to-head showed OSM coverage ≥ Google and the walking-core score is
distance-weighted counts (never uses Google's ratings). Measurement → local
Overpass; Google → suggestions/reviews/photos. **Status:** decided (see
[[feedback_osm_for_measurement]]); reverses #2.

### ADR-8 — RLS: trips/entries readable by authed, writable by owner
The workspace is two people (Janice + Chris) sharing trips, not multi-tenant.
Read-by-authed (both co-view), write-by-owner. Caches are public-read, no public
write (hardened in 0018, see [security-review.md](security-review.md)).

## Perf read (#49)

Profiled the trip surfaces; the workload is small (one trip, ≤~80 entries) so
nothing is hot. Observations + what's already done:

- **Derived data is memoized** — `tripDays`, `entriesByDay`, `cashNeeded`,
  `bookingsLedger`, `flights`, `pool` all behind `useMemo(…, [trip])`. ✓
- **The map is lazy** — `dynamic(() => import("./TripMapInner"), {ssr:false})`,
  so Leaflet + tiles only load on the Map tab. ✓
- **Writes are debounced** (600 ms) and **one-per-gesture**; real-time skips own
  echoes — no write storms, no cursor jumps. ✓
- **Grid DOM** — `TripGrid` renders day-columns × positioned blocks; for an
  11-day trip that's ~80 absolutely-positioned nodes, fine. A 30-day trip would
  want column virtualization (follow-up, not needed now).
- **Bundle** — the production build passes (CI gate); react-leaflet is the
  heaviest dep and is code-split behind the Map tab.

No perf fix warranted at current scale. Re-check when a trip exceeds ~150
entries or a multi-week grid (then: virtualize the grid, paginate Days).
