# Visit plan — per-city trip setup, itinerary, checklists (RETIRED)

> **Status: REMOVED 2026-06-29** (Trip Composer P1, [#107](https://github.com/ChristopherSchubert/issues/107)).
> The per-city `/cities/[slug]/plan` route + the "PLAN" city-nav tab are gone.
> Trip composition lives entirely in [trip-planner.md](trip-planner.md)
> (`/planning/calendar`) and in the multi-city `/trips` route now. The
> "When to visit" diagnostic moved into the Detail page (Chapter V renders
> the climate curve + Prime/Off-season windows + a Visit-now badge with the
> trend hint that the old panel surfaced). The city-row columns the form
> wrote into (`arriveDate`, `departDate`, `flightDetails`, `lodgingDetails`,
> `carDetails`, `days`, `checklists`, `status`) are **kept** — no migration —
> for backwards-compat with Visited/Assessed and as raw material for the
> future Place/Leg recast ([#110](https://github.com/ChristopherSchubert/issues/110)).
> See [trip-composer.md](trip-composer.md) for the reconciliation design.

The historical content below documents how the surface worked before removal.

---

The **Plan** tab on a city page (`/cities/[slug]/plan`). Where the swim-lane
[trip planner](trip-planner.md) is the cross-city *when-to-go* view, this is
the single-city *how-the-trip-comes-together* page: the diagnostic visit
window up top, then the editable trip logistics, a day-by-day itinerary, and
three structured checklists.

It's distinct from `VisitWorkspace` (`/visit/planned`), which lists committed
trips across cities. This page is one city, edited in depth.

## How it works today (code path)

- **Route**: [app/cities/[slug]/plan/page.js](../app/cities/[slug]/plan/page.js)
  → [components/VisitPlanRoute.jsx](../components/VisitPlanRoute.jsx) resolves
  the `cityItem` from `usePlannerCity(slug)` and renders inside `AppShell`
  (`activeMode="plan"`).
- **Component**: `VisitPlan` in
  [components/PlannerShell.jsx](../components/PlannerShell.jsx). It's a thin
  controlled form — every edit flows up through `onPatch` / `onChangeDay` /
  `onChangeChecklist`, all of which call `updateCity(cityItem.id, patch)` in
  the route. Supabase is the system of record; `PlannerProvider`
  debounce-writes (no local form state to persist).
- **Persisted fields** (whitelisted in `PlannerProvider`'s `allow` list):
  `status`, `tripWeek`, `tripLength`, `arriveDate`, `departDate`,
  `flightDetails`, `carDetails`, `lodgingDetails`, `logisticsNotes`, `days`
  (`[{title, plan}]`), `checklists` (`{before|during|after: [{text, done}]}`).

### Sections (top → bottom)
1. **When to visit** — `VisitWindowPanel`. The Prime + Off-season windows over a
   12-month comfort/crowd strip, plus the "visit now" urgency badge. Driven by
   `cityVisitWindow()` / `monthlyComfortScores()` / `visitNowScore()`; shows
   "awaiting climate data" rather than faking when unmeasured. See
   [visit-window.md](visit-window.md).
2. **Trip Setup** — split into a **Schedule** sub-group (Status, Trip week,
   Trip length, Arrive, Depart) and a **Logistics** sub-group (Flight, Car,
   Lodging, Logistics notes). A derived **"N nights"** pill in the Schedule
   eyebrow comes from `tripNights(arriveDate, departDate)` in
   `lib/planner-data.js` (check-in→check-out math, `null` when unset — never a
   fake 0).
3. **In-City Itinerary** — add/reorder/remove day cards; dashed empty state.
4. **Structured Checks** — three checklist columns (Before / During / After)
   with done/total counts, strike-through on completed items, per-column empty
   states.

## Design / style (2026-06-09 redesign)

The "When to visit" panel was already editorial; everything below it read as a
generic admin form (unstyled controls with no focus state, a short field
orphaned beside tall textareas, default browser checkboxes). The redesign
brought the form sections up to the magazine aesthetic, using only project
tokens from `globals.css`:

- **Controls** gained accent focus rings (`--accent` at 14%), hover borders
  (`#bfae96`, the app-wide input-hover value), styled placeholders, a custom
  SVG select chevron, and custom accent checkboxes.
- **Layout**: Schedule is a 5-up grid that collapses to 2-up / 1-up; Logistics
  is a balanced 2×2 of equal-height textareas (kills the old orphaned-field
  gap). Sub-groups are separated by an accent eyebrow + hairline divider.
- **Itinerary rows** became day cards: a green number chip, the title in
  Fraunces, hover-revealed ↑/↓/× actions (disabled at the ends).
- **Empty / ghost affordances**: dashed empty states and ghost "+ Add"
  buttons instead of heavy default buttons.

CSS lives in [app/globals.css](../app/globals.css) under the
`.form-grid` / `.form-subhead` / `.field` / `.day-card` / `.checklist-card` /
`.check-row` / `.add-row-btn` rules. The classes are scoped to this component
(the shared base-input rule also covers the image-search box).

## Status

- **Live.** Redesign shipped 2026-06-09; verified in-browser on Allison Park
  (no console errors, real arrive/depart preserved, derived nights pill
  correct).

## TODOs / future direction

- **Adapt for the home city.** Allison Park is the owner's residence, not a
  trip — the flight/car/lodging block is moot there. Consider hiding or
  relabeling the Logistics group when the city is the home base. (Owner asked
  about this 2026-06-09; deferred as a separate change.)
- No keyboard reorder for itinerary days (pointer ↑/↓ only).
