# Trip Composer — Plan/Trip reconciliation (design spec)

**Status:** Phases 1 + 2 + 3 ✅ shipped 2026-06-29 (#107 + #108 + #109). Legacy
"Planned" bridge **retired 2026-06-29 (#112)**; **drag-off + live merge-during-drag
gesture shipped same day (#111)**. The whole epic is closed. Only the
explicit-deferred catch-all (#110) remains open as a context-holder.
**Date:** 2026-06-28. **Owner decision:** Chris (session 2026-06-28).
**Provenance:** Shaped through a 4-persona design review (an IA, a JTBD product
strategist, an interaction designer, a first-principles designer) run as subagents
over three rounds. The personas are a *thinking tool*, not external authority — the
value is where they converged and where the owner made the call. Implementation is
the writer's; this doc is the design + rationale.

---

## Problem

The app has **three** overlapping trip-planning surfaces that don't reference each
other:

1. **Per-city Plan tab** (`/cities/[slug]/plan`, [components/PlannerShell.jsx](../components/PlannerShell.jsx)
   → `VisitPlan`): a single arrive/depart schedule + free-text flight/car/lodging,
   a day-by-day itinerary, and Before/During/After checklists — **all stored on
   the city row**.
2. **Planning swim-lane** (`/planning/calendar`, the `TripPlanner` inside
   `PlannerShell.jsx`): drag a city onto a time bar to "commit" it; the Commit
   button writes `status: "Scheduled"` + `arriveDate`/`departDate` to the city
   row (PlannerShell.jsx ~line 1241).
3. **`/trips`** (Epic #7): a proper multi-city planner — a trip is dated and
   multi-leg (Slovenia = Ljubljana → Bled → Piran), per-leg hotels, flights, a
   budget, Plan/Days/Book/Shelf/Grid/Map tabs. Stored in `trips`/`trip_entries`.
   **Fully decoupled from the funnel** — adding a city as a leg writes nothing back
   to its stage.

Two defects fall out of this:

- **Cardinality bug.** A city is many-to-many with trips (Newport could be in a
  2026 trip *and* a 2028 trip), but trip data (`arriveDate`, `days`, `checklists`,
  `decision`) lives on the single city row. A second trip silently overwrites the
  first. This is the original sin the reconciliation must fix.
- **Disconnection.** The per-city Plan tab and `/trips` are two parallel planning
  worlds with no link between them; the swim-lane is a third. "Planned" as a
  hand-set city status can disagree with "is the city actually in a trip."

## Decision — the reconciled three-surface model

Each surface gets one job, around the right noun:

| Surface | Job | Owns |
|---|---|---|
| **City** (Board funnel + Detail) | "Is this worth a trip, and when?" — a **permanent fact sheet** | metrics, why-prose, images, journal, survey, and the **"When to visit"** climate diagnostic |
| **Planning swim-lane** (`/planning/calendar`) | "**When** do we go?" — the **trip composer** | placing cities on the calendar → creating trips; merging adjacent stays |
| **`/trips`** | "**How** do we run it?" — the **detailed planner** | per-trip, per-leg dates, hotels, flights, day-by-day, checklists, budget |

The unifying rule the owner set:

- **Every planned city has a trip.** Dragging a city onto the swim-lane bar
  **creates a trip** (a single-city trip; bar dates = trip dates). This is where
  trip data goes to the trip/leg instead of the city row — **the cardinality fix
  lands here.**
- **Planned ⟺ has a trip.** The "Planned" funnel stage becomes *derived from trip
  membership*, not a hand-set city field. One fact, no drift.
- **Adjacent stays can merge.** When two committed stays are back-to-back on the
  timeline ("can't go home in between"), the app **offers** (never automatic) to
  merge them into one multi-leg trip.

## Trip lifecycle & funnel derivation

Funnel stages become a read over the city's relationship to trips, *except* where
lived experience applies:

- **backlog / planning** — scouting interest, no committed trip. (The Board's
  drag between backlog↔planning still sets this manually for now —
  [components/FunnelBoard.jsx](../components/FunnelBoard.jsx).)
- **planned** — the city is a leg in a trip. **Derived**, not stored.
- **visited / assessed** — *unchanged for now.* Today these come from
  `VisitReview` (survey save → "Visited"; the `decision`/"would you go back?"
  field → "Assessed", [components/VisitReview.jsx](../components/VisitReview.jsx)).
  Deriving them from trip + survey is **deferred** (see Scope).

### The baseline exception (do not model this away)

Baseline / reference places — the Slovenia anchors, Allison Park (the owner's
home), the Pittsburgh-area towns — are **assessed from lived experience, with no
app-planned trip**. They anchor the felt-score scale. So **"Assessed" = "has a
completed survey," which is *usually* post-trip but can also be a baseline.** The
model must allow assessment with no trip. In Place/Leg terms (deferred): a survey
may attach with `leg_id = null`. Outcome-on-the-leg survives this because the leg
is *optional* for assessment, not mandatory.

## The merge feature

- **Trigger:** two committed stays whose bars are **contiguous or ≤1 calendar-day
  apart** (one travel day). A 2+ day gap implies going home → no offer. Implement
  as a single named constant (e.g. `ADJACENT_TRIP_GAP_DAYS = 1`); the merge
  affordance appears/disappears live as the user drags a bar's edge.
- **Never automatic.** The option *appears* (an affordance on the seam between the
  two bars); the user chooses.
- **Mechanics:** legs concatenate in **date order**; each leg keeps its origin
  city FK and its own hotels/day-plans/checklists, untouched. Merge **absorbs into
  the earlier trip** (minimizes record churn); default name becomes the city names
  in date order ("Asheville → Brevard"), inline-editable. Budget = sum of
  leg/entry costs (*writer to confirm trip budget is derived, not a stored
  field*). Merge is associative and repeatable.

## Edge-case decisions (resolved with the panel, round 3)

| # | Case | Decision |
|---|---|---|
| 1 | Drag a city **off** the bar | Remove that **leg**. Last leg → delete the trip; city reverts to pre-Planned. Merged trip → drop just the leg, trip survives. **Undo toast**, no confirm modal. |
| 2 | **Un-merge / split** | No dedicated feature in v1. Escape hatch = drag a leg off (case 1), then re-drag the city to make a fresh trip. Dedicated "Split" → v2. |
| 3 | **Merge mechanics** | Concatenate legs in date order; legs keep city FK + their detail; absorb into earlier trip; auto-name = cities in date order, editable. |
| 4 | **Adjacency threshold** | Contiguous or ≤1-day gap. Named constant. Affordance updates live on drag. |
| 5 | **Default trip name** | `"[City] [Year]"` (e.g. "Asheville 2026"); single-click inline rename. Merged → concatenated city names. |

## Data-integrity invariants (the load-bearing part)

`Planned ⟺ has-a-trip-leg` must be enforced at the **data layer**, not assumed in
the UI. All four reviewers hit facets of this:

- **Trip deletion cascades.** Deleting a trip (or its last leg) must revert the
  city's derived stage and clear any city→trip reference. Otherwise cities get
  stuck "Planned" with no backing trip — invisible corruption. *(Theo)*
- **Cities are soft-deleted; archival is blocked while a leg exists.** A leg holds
  the city FK; archiving/deleting the city under it dangles the reference. Add
  `archived_at`; block archival of a city that has an attached leg. *(Maya)*
- **Stage-advance guard while in a trip.** If a city in a (possibly merged) trip
  is advanced (e.g. to Visited) by the still-manual path, surface/guard the
  conflict so `/trips` doesn't show a leg whose city "vanished" from Planning.
  *(Priya)* — largely dissolves once Visited/Assessed are derived (deferred).
- **Trip owner field.** This is a household tool (Janice is a primary user) on the
  family-hub identity layer. Trips need an explicit owner now, even before any
  multi-user editing. *(Devin)* — *writer to verify `trips` already carries owner
  (it is per-user today; confirm).*

## Scope

### Phase 1 ✅ Shipped 2026-06-29 (#107)
- ✅ Per-city Plan tab removed: `app/cities/[slug]/plan/page.js` deleted,
  `defaultCityNav` no longer includes a Plan link, the legacy `/cities/[slug]/visit`
  redirect now lands on Detail instead of Plan. `VisitPlanRoute.jsx` deleted;
  `VisitPlan` + `VisitWindowPanel` removed from `PlannerShell.jsx` (along with
  their now-unused imports — `MONTHS`, `cityVisitWindow`, `monthlyComfortScores`,
  `visitNowScore`, `tripNights`). `VisitWorkspace`/`PlanningMobile` city links
  re-pointed to `/cities/[slug]` (Detail).
- ✅ "When to visit" reuse decided by inspection: Chapter V (`ChapterWhen`)
  already renders the full climate curve, Prime/Off-season annotations,
  climatology heatmap, and Extremes panel. The ONE thing the deleted
  `VisitWindowPanel` carried that Chapter V didn't was the **Visit-now badge**
  (this-month score + trend nudge: "↓ trending down — don't miss it"). That
  single piece was ported into Chapter V as `<VisitNowBadge>` (same logic via
  `visitNowScore`); no duplicated curve.
- ✅ City-row columns kept intact (`arriveDate`, `departDate`, `flightDetails`,
  `lodgingDetails`, `carDetails`, `days`, `checklists`, `status`). No migration.
- ✅ Funnel transitions verified to still work — Board drag, swim-lane Commit,
  and Assess survey are unaffected.

### Phase 2 ✅ Shipped 2026-06-29 (#108)
- ✅ Swim-lane ✓ Commit button now calls `createTrip()` with a single-city
  leg (`name: "{City} {Year}"`, `legs: [{ cityId, name, arrive, depart }]`).
  No `arriveDate`/`departDate`/`status` writes to the city row by Commit.
- ✅ Uncommit (↩) removes the backing trip via `removeTrip(t.id)`; for
  pre-#108 legacy committed cities (no trip backing them), it falls back to
  clearing `status` on the city row.
- ✅ "Planned" derives from trip membership in `cityStage()` (lib/stages.js):
  `inTrip` flag wins over the legacy status/dates check. Only future/ongoing
  trip legs count — past trips fall through (deriving Visited/Assessed from
  past trips is deferred per below).
- ✅ Layout: `TripProvider` moved OUTSIDE `PlannerProvider` so the planner
  can `useTrips()` and augment every cityItem with `inTrip` before
  consumers see it. Single source of truth — 11 cityStage call sites
  trip-aware in one place, no caller refactor.
- ✅ Swim-lane `committedLanes` reads dates from the trip leg (when
  `c.inTrip`), keeping the bar in sync with `/trips`-side edits. The
  drag-bar persist similarly writes back to the trip leg (or city row for
  legacy data). The swim-lane and `/trips` operate on the same trip record.
- ✅ Legacy data read-compatibly: pre-#108 committed cities (e.g. Newport
  with `status='Scheduled' + arrive/depart_date`) still show as "Planned"
  via a temporary bridge in cityStage. **Retired in #112** — the lone
  legacy row (Newport, RI) was migrated to a real trip
  ("Newport 2026") by `scripts/migrate-scheduled-cities-to-trips.mjs`, and
  the bridge branch is gone. `cityStage()` now derives "Planned" only from
  `cityItem.inTrip`.
- ✅ Tests: +4 cityStage tests locking the new contract (inTrip wins;
  bridge contract — updated in #112 to assert it's retired;
  assessed/visited still beat trip membership). 35 + 169 tests green.

### Phase 3 ✅ Shipped 2026-06-29 (#109)
Three commits within the ticket:
- ✅ **Invariants (`ada3fc2`)** — `0028_p3_invariants.sql` adds
  `travel.cities.archived_at` + a `city_archive_guard()` trigger that
  raises if archival is attempted while the city is still a leg in any
  trip (verified live: Ljubljana blocked, Eureka Springs allowed). Trip
  owner already enforced (`trips.user_id NOT NULL` since #90). Cascade is
  automatic post-#108 (verified by a test modelling the boundary).
- ✅ **Merge affordance (`9329f8e`)** — `ADJACENT_TRIP_GAP_DAYS = 1`
  constant; the planner renders a ⇄ Merge button between two committed
  bars on the same row whose gap ≤ 1 day and that belong to different
  trips. Click → `mergeTrips()`: concatenates legs in date order
  (preserves each leg's city FK + hotels/days/checklists), absorbs into
  the earlier trip, deletes the later one, defaults the name to
  `City → City` (inline-editable in `/trips`). Verified live against the
  family DB: Camden + Ithaca test pair → merged into "Camden → Ithaca",
  later trip deleted, legs intact.
- ✅ **Leg-removal rules + undo (this commit)** — the ↩ unlock button now
  routes through `removeLegFromTrip()`: single-leg trip → `removeTrip()`
  (last leg = delete trip); multi-leg → `updateTripFrame()` with legs
  filtered, frame dates re-span the remainder, trip survives. Stashes a
  snapshot for the 6-second undo toast; click "Undo" → restores the leg
  (or rebuilds the trip). Verified live: Camden→Ithaca→Mystic, click ↩ on
  Ithaca → bar drops, trip name + Camden+Mystic survive, toast appears;
  click Undo → Ithaca restored.

### Phase 3 follow-on ✅ Shipped 2026-06-29 (#111)
The deferred drag interaction landed as the same-day polish:
- ✅ **Drag-off gesture** — committed bars are draggable. Vertical drag past
  60 px flags the bar (turns red, `.will-drop` class) and on pointerup
  invokes `removeLegFromTrip()` with the same single-leg / multi-leg
  rules as the ↩ button. No confirm modal — the 6-second undo toast is
  the safety net. The ↩ button stays (keyboard path).
- ✅ **Live merge-during-drag** — `onBarMove` updates the `dragOverlay`
  state every pointer frame; `mergePairs` overlays it onto the dragged
  bar's lane, so the ⇄ Merge button appears/disappears in real time as
  the bar's edge approaches an adjacent trip's seam. The bar's JSX also
  reads from `dragOverlay` so React re-render doesn't snap the bar back
  during drag.
- Verified live: drag Newport's committed bar 100 px down → red `will-drop`
  state, release → trip deleted (DB: 0 Newport trips), toast `Trip
  "Newport 2026" deleted · Undo` appears, click Undo → trip restored
  (DB: 1 Newport trip, new id but same name + leg).

### Deferred (v2+, captured not lost)
- **Want-list** (a trip-independent per-city "things to do" list that feeds a
  trip's day-planner). Owner deferred it; the kept city-row `days` column makes it
  free to revive.
- **Full Place/Leg rename** + moving the `decision`/outcome field onto the leg.
- **Deriving Visited/Assessed** fully from trips (with the baseline exception).
- **Dropping city-row trip columns** + the one-time data migration into
  `trip_entries`. Only after Phase 2/3 are proven.
- **Dedicated split UI.**

## Rejected alternatives

- **Embed the trip planner inside the city page.** Rejected: rebuilds `/trips`
  complexity on the city page — the owner explicitly didn't want to match that
  complexity in two places.
- **Drop the city-row trip columns now.** Rejected: destroys real planning data
  with no migration; blocks a future want-list rebuild. Keep the data.
- **Build the want-list now.** Rejected (owner): defer until the need is felt.
- **Full Place/Leg schema recast now.** Rejected: correct long-run model, but a
  mine-call migration; ship the small, coherent waypoint first.
- **Freeze the `status` column immediately on killing the Plan tab.** Rejected as
  *premature*: verification showed the funnel doesn't break, and `/trips` is
  decoupled, so deriving Planned from trips is Phase-2 work, not a same-PR
  requirement.

## Open items for the writer to verify

- Trip **budget**: derived from entry costs, or a stored trip field? (Affects
  merge.)
- `trips` table **owner** column present? (Integrity rule.)
- Detail **Chapter V** vs. the Plan tab's `VisitWindowPanel` — how much already
  overlaps before relocating.

## Follow-ups (tracked as GitHub issues)

- **[#107](https://github.com/ChristopherSchubert/schubert-livability-scout/issues/107)
  — Phase 1: Remove the per-city Plan tab; fold "When to visit" into Detail;
  retain city-row data.** Independently shippable. No migration.
- **[#108](https://github.com/ChristopherSchubert/schubert-livability-scout/issues/108)
  — Phase 2: Swim-lane Commit creates a trip; derive Planned from trip
  membership.** The engine change; fixes the cardinality bug. After #107.
- **[#109](https://github.com/ChristopherSchubert/schubert-livability-scout/issues/109)
  — Phase 3: Merge adjacent stays + leg-removal rules + integrity invariants.**
  After #108. ✅ Shipped 2026-06-29.
- **[#111](https://github.com/ChristopherSchubert/schubert-livability-scout/issues/111)
  — Drag-off gesture + live merge-during-drag.** Follow-on to #109's deferred
  drag interaction; same-day polish. ✅ Shipped 2026-06-29.
- **[#112](https://github.com/ChristopherSchubert/schubert-livability-scout/issues/112)
  — Backfill pre-#108 'Scheduled' cities + retire the legacy "Planned"
  bridge.** ✅ Shipped 2026-06-29. The dual-source-of-truth Phase 2 left
  behind is gone.
- **[#110](https://github.com/ChristopherSchubert/schubert-livability-scout/issues/110)
  — Deferred: want-list, full Place/Leg recast, column drop, split UI.** Context
  lives in this doc; revive when the need is felt.
