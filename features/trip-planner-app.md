# Trip Planner app (the live `/trips` feature)

The real, shipped Trip Planner — the canonical deck
([trip-walkthrough.html](../public/mockups/trip-walkthrough.html)) built as a
working Next.js feature. Create a trip, gather candidates, lay out days, and
read it as an agenda, a calendar, or a booking sheet — on real Supabase data.
Built 2026-06-11 (Epic #7, Phases 0–2). This doc is the map; the deck is the
design source of truth.

## Routes

- `/trips` → [components/TripsIndex.jsx](../components/TripsIndex.jsx) — the
  user's trips + the **New trip** composer ([TripComposer](../components/TripComposer.jsx)).
- `/trips/[id]` → [components/TripWorkspace.jsx](../components/TripWorkspace.jsx)
  — the tabbed trip page (**Plan · Days · Book · Shelf · Grid**).

(The older swim-lane `/planning/calendar` is a different, separate surface — see
[[trip-planner]]. Don't conflate them.)

## Data layer (Phase 0)

- **Tables:** `trips` (frame: name/dates/legs/glance/options + `travelers`,
  `passes`) and `trip_entries` (one row per entry — `id, trip_id, day, payload
  jsonb, sort`). Migrations `0016`/`0017` (applied). `trip_entries` is in the
  `supabase_realtime` publication. RLS: **read** by any authed user (both
  travelers co-view), **write** owner-only. The `entries` blob on `trips` is the
  v1 migration source, superseded by `trip_entries`.
- **`lib/db.js`** — the only `getSupabase()` caller. Trip helpers: `fetchMyTrips`,
  `fetchTrip` (frame + hydrated entries), `insertTrip`, `updateTrip` (TRIP_COL
  mapPatch), `deleteTrip`, `upsertEntry`, `deleteEntry`, `reorderEntries`,
  `subscribeTrip` (real-time channel).
- **[TripProvider](../components/TripProvider.jsx)** — loads trips, hydrates the
  active trip, debounced writers (`updateEntry`/`updateTripFrame`), one-shots
  (`addEntry`/`removeEntry`/`reorder`/`createTrip`/`removeTrip`), and a real-time
  merge with **own-echo suppression** so a local edit isn't clobbered by its
  echo. Selectors `useTrips`/`useActiveTrip`/`useTripEntries`. Mounted in
  `app/layout.js` inside `PlannerProvider`.
- **Place resolution** — [lib/place-resolve.js](../lib/place-resolve.js) +
  `app/api/places/search/route.js`. searchText → Google `place_id` (the pois
  key) or **honest null**. The migration resolves against the pois cache (no
  Google call); the EntryEditor picker uses the API route (server key —
  needs `GOOGLE_PLACES_API_KEY` in env).
- The real Slovenia trip migrated v1→v2 by
  [scripts/migrate-slovenia-v2.mjs](../scripts/migrate-slovenia-v2.mjs)
  (79 entries; `cashNeeded` = €927).

## The surfaces (Phases 1–2)

- **Plan** — [TripPlan](../components/TripPlan.jsx): the deck's **window-as-nav
  focus flow** (rebuilt 2026-06-13 after the trips-flow audit). Overview = the
  [TripWindow](../components/TripWindow.jsx) date ribbon + collapsed Flights bar +
  width-proportional stay bars (one per leg). Click a leg (in the window or its
  bar) → the page **focuses** that city: a header, its day columns (the dated
  entries, color-keyed + icon-tagged), and one **bucket** (undated want-list) with
  [GatherBucket](../components/GatherBucket.jsx) (browse the pois cache, ranked by
  rating × log(reviews)), ＋ add your own, and **Lay out →**. Replaces the old
  always-expanded list where every leg's tray bloomed at once. Styling lives in
  [trips.css](../app/trips.css) (`.tw-staysrow`/`.tw-daycols`/`.tw-mini`/`.tw-bucket`).
- **Days** — the agenda by day; `＋ add` (create) and `⚡ solve` per day.
- **Book** — [BookView](../components/BookView.jsx): cash needed, the bookings
  ledger (soonest deadline first), passes — all derived by `lib/trip.js`.
- **Shelf** — gathered candidates not yet on a day (`day = null`); place onto a
  day or open to edit.
- **Grid** — [TripGrid](../components/TripGrid.jsx): the timed calendar; entries
  positioned by time across day-columns. Click a block to edit.
- **[EntryEditor](../components/EntryEditor.jsx)** (keystone) — the v2 atom side
  sheet: category × status, time, place (picker), note, cost, booking.
- **Solve** — [lib/solve-adapter.js](../lib/solve-adapter.js) maps entries ⇄
  `lib/solve.js#solveDay`: booked/reserved-with-time PINNED, the rest placed by
  travel-aware nearest-neighbour, meals into meal windows.

## Cities from the scout + provenance (Janice #3)

Overview shows a **provenance line** — "the places **you** scouted in your Atlas
— not a preference guess, not a popularity list · ＋ other city adds anything you
haven't scouted" — Janice #3's reassurance. Below it, a **city tray** of scouted
Atlas cities (strictly `planner.cities`, never a ranking query, so the claim is
literally true) NEAR the trip's region (haversine to leg anchors, ≤400km, capped
12; honest "no scouted places near this trip" when empty, e.g. a Slovenia trip vs.
a US atlas). Clicking a chip appends a leg via `appendCityLeg` ([trip-window.js](../lib/trip-window.js),
tested) which funds the new 1-night leg from the longest leg and **preserves the
total span**. **＋ other city…** searches `/api/places/search` for non-Atlas
destinations. Empty trips show an "add a city to start" dropzone. Follow-up:
drag-from-tray-onto-window (click-to-add ships now).

## Hotel search → place a stay (Janice #5)

A leg with no stay offers **🔍 Search hotels** (empty stay bar / focus header).
[StaySearch](../components/StaySearch.jsx) queries `hotels in <city>` via
`/api/places/search` with `rich:true` — a higher-SKU field mask
(`FIELD_MASK_RICH` in [place-resolve.js](../lib/place-resolve.js)) that adds
`googleMapsUri,rating,userRatingCount`; the default mask (EntryEditor's picker)
is untouched, so only hotel search pays the richer cost. Each result shows ★rating
(count) + a prominent **↗ photos & reviews** link to the Google listing — Janice's
ritual ("I POUR over reviews and photos"). **＋ use this stay** creates the stay
entry on the leg and opens the EntryEditor for booking details (confirmation /
cancel-by stay honest-null until entered). Follow-ups (commented in StaySearch):
drag-onto-segment, ✂ split-a-stay. Local dev needs `GOOGLE_PLACES_API_KEY` in
`.env.local` (mirrored from Keychain `google-places-api-key`); prod has it on Vercel.

## Chips screen meals (Janice #2)

A traveler's **veg/vegan chip** isn't just a label — it screens meals (the
deck's promise made real, 2026-06-13). `tripDietChips(trip)` (in
[lib/trip.js](../lib/trip.js)) collects the active diet chips; `mealVegState(entry,
chips)` returns `ok` (a cited veg marker is present) or `unverified` (chip active,
no marker) — **never a fabricated "no veg"**. `<MealScreen>` ([atoms.jsx](../components/atoms.jsx))
renders 🥦 veg ✓ / 🥦 veg? on meal entries across EntryRow, the Plan day-columns +
bucket, the Grid, and the GatherBucket suggestions tray (header: "meals screened
for vegetarian (your chips)"). Veg signal is honest-cited: `servesVegetarianFood`
**or** a vegan/vegetarian `primary_type` ([deriveMarkers](../lib/sourcing.js)).
Gathered places now carry their markers forward, so a saved veg spot reads veg ✓.
The composer shows the effect inline when you toggle a diet chip.

## Clocked agenda + pins (Days)

- **Clocked agenda (rank 6)** — `solveTripDay` ([solve-adapter.js](../lib/solve-adapter.js))
  used to drop the solver's generated connective blocks (travel/rest/free carry no
  entry id), so the day looked like anchors jumping with unexplained gaps. It now
  returns the full ordered `schedule`; after a solve, the Days view renders the
  interleaved agenda — persisted anchors + muted, non-editable "auto" connective
  rows with a time-rail. Durations come straight from solve.js (never invented).
- **Pin / hold (rank 7)** — an explicit `pinned` boolean (jsonb payload, no schema
  change). EntryEditor has a "📌 Hold at this time" checkbox; `fixedTimeOf` keys off
  `e.pinned` (not the old dishonest status==="booked" inference); pinned rows show
  📌. A day tracks "edited since solve" → the button relabels "↻ Re-solve around
  pins", which keeps pinned entries fixed.

## Map + Grid (deck parity)

- **Map** ([TripMapInner](../components/TripMapInner.jsx)) — honest about coverage:
  a caption "Showing N of M stops — X aren't pinned to a place yet" whenever placed
  < placeable (shared `placeableStops(trip)` in [trip-frame.js](../lib/trip-frame.js)
  so Map + Frame can't disagree). Points grouped + routed per leg (leg colors),
  with a leg-focus control. Coords coerced to Number (jsonb stores strings) and a
  degenerate-cluster guard so the fit never snaps to street zoom.
- **Grid** ([TripGrid](../components/TripGrid.jsx)) — leg-paged (one leg per tab /
  print page, `break-after:page`), a category legend + 🔒 booked · 💶 cash · 📌
  pinned key, honest status glyphs (only on real data), and `category:travel`
  drive connectors (duration shown only when real). Hourly gutter kept (Janice #7).

## Follow-ups (tracked as GitHub issues)

- **#17 drag** — @dnd-kit reorder within a day / shelf→day.
- **#22 window** — drag-to-adjust dates, soft edges (currently read-only).
- **#23/#24 Transport/Stay editors** — flights + per-leg lodging search/book.
- **#25 gather** — add-your-own + the OptionsDirectory; cache-write on resolve.
- **#26 shelf** — alternates, leg grouping, drag (MVP shipped: pool + place).
- **#29 grid** — leg-paged print output (calendar view shipped).
- **#30 day map** — Leaflet/OSM pins per entry in time order.
- **#32 feasibility** — over-pack flags / free-gap surfacing (Solve flags exist).
- **Phase 3** (#33 frame · #34 variations · #35 mobile), **spikes** (#36
  real-time merge · #37 timezone), **quality** (#42–46, #49–51).
- **Solve polish** — single-meal can land in the later meal window; refine
  window selection.
- **#62 realtime/save races (resolved)** — four fixes: (1) `addAndEdit`/
  `addFlight` guard on a missing `trip`; (2) `reorder` clears the `ownWrites`
  echo stamps on write failure so the corrective realtime echo isn't suppressed;
  (3) fork creation is a single atomic frame write (range-implicit Option A) so
  there's no per-entry tag burst racing the metadata; (4) the open `EntryEditor`
  receives the *live* entry and adopts remote updates while the draft is
  untouched (a `hasEdited` guard never clobbers in-progress edits).
- **Runtime** — mirror Keychain `google-places-api-key` → `.env.local` + Vercel
  as `GOOGLE_PLACES_API_KEY` for the live place picker.

## Frame tab — the briefing layer (#33)

The **Frame** tab turns a trip into a finished briefing, every value DERIVED
from trip data or left honestly blank (never guessed — CLAUDE.md's one rule).
Four panels, all from `lib/trip-frame.js` (pure, unit-tested in
`test/trip-frame.test.mjs`):

- **Glance** — fact grid: destination (legs), dates/nights (window), lodging +
  check-in (stay entries), diet + travelers incl. pets (roster), theme. Weather
  and drive-from-home aren't in trip data yet → rendered as "—", not fabricated.
- **Read first** — limitations derived from trip state, each cited with a source
  + asOf date: unpinned stops (won't map/solve), unscheduled dated entries, things
  still to-book, cash-only totals. A clean trip shows "nothing flagged".
- **Booking checklist** — every to-book + booked thing, soonest deadline first,
  with phone/url/book-by. Checking a row persists (flips the entry status
  toBook⇄booked); confirmation-backed rows are locked done.
- **Sources** — the citation ledger: only the provenances actually present
  (Google Places cache, hand-entered costs, booking records, NOAA when fetched).

`components/TripFrame.jsx` renders it; `markerUnion()` powers the marker strip.

## AppShell integration + URL-per-view (#15)

The workspace is no longer a standalone island — it's a first-class app mode.
`AppShell` gained a **Trips** entry in `NAV_MODES` and a `TripContextStrip`
(parallel to `CityContextStrip`): back-arrow → `/trips`, the trip name, then the
Plan·Days·Book·Shelf·Grid·Map·Frame sub-tabs. Every view is its own URL
(`/trips/[id]/[tab]`); there is **no in-page tab state** — switching views is
navigation (project convention).

- `app/trips/[id]/[tab]/page.js` — one-line RSC, validates `tab`, renders
  `<TripWorkspaceRoute id activeTab>`. `app/trips/[id]/page.js` redirects to
  `…/plan`.
- `components/TripWorkspaceRoute.jsx` — `"use client"`: reads the trip from
  `useTrips()`, handles loading/not-found, wraps `<TripWorkspace>` in
  `<AppShell activeMode="trips" tripItem tripNav={defaultTripNav(...)}>`.
- `TripWorkspace` is now panel-only: takes `activeTab`, renders one panel + a
  compact summary band (no nav, no nested `<main>`).
- `defaultTripNav(trip, active)` / `TRIP_TABS` live in `AppShell` for the strip;
  the server route defines its own `TRIP_TABS` (importing a plain value from a
  `"use client"` module into a server component yields a client-ref proxy, not
  the array — a real gotcha hit during the build).

Verified in-browser: Trips highlights in the top nav, the strip shows the
active sub-tab, sub-tab clicks change the URL and panel without losing the
loaded trip, and bare `/trips/[id]` redirects to `…/plan`.

## Drag-to-reorder (#17, @dnd-kit)

The drag foundation the epic locked on @dnd-kit. Within a day, drag an entry's
grip (⠿) to reorder it; the order persists via `TripProvider.reorder` →
`reorderEntries` (sort = index). `components/DayEntries.jsx` wraps the day's
list in a `DndContext` + `SortableContext` with **two sensors**: a PointerSensor
(mouse/touch, 4px activation so a plain click still opens the editor) and a
**KeyboardSensor** (Tab to the grip, Space to lift, arrows to move, Space to
drop) — the latter also delivers the keyboard drag the a11y pass (#38) deferred.
`EntryRow` was extracted to its own module so it renders both statically and as
a sortable item (the grip carries the listeners; the row body stays
click-to-edit). Note: the Days agenda sorts timed entries by clock time, so
drag-reorder is visible for untimed (bucket) entries; timed entries keep their
chronological order by design.

## Mobile day-focus / "Today" view (#35)

The Days panel carries a horizontal **date rail** (one chip per day, with the
day's entry count). On desktop it's a jump-nav — click a chip to smooth-scroll
to that day; every day stays visible. On a phone (≤640px) the rail sticks under
the header and the panel shows **one day at a time** (the deck's "Today" view):
`.tw-day:not(.focus){display:none}`. Focus state is in-panel UI (`focusDay`),
not navigation — defaults to the first day. Completes the responsive work #35
began (the earlier commit shipped the responsive CSS for the other surfaces).

## TripWindow — draggable leg boundaries (#22)

The Plan tab's calendar strip is now interactive. The boundary between two
date-adjacent legs is a draggable handle (`components/TripWindow.jsx`): drag it
(PointerSensor, 3px activation) or focus it and press ←/→ to move days from one
leg to its neighbour. The trip's start/end stay fixed and only the two touching
legs change `arrive`/`depart` — **no cascade**. Moves snap to whole days
(1 cell = 1 day, measured off the legs-row width) and clamp so neither leg drops
below one day. A live preview re-renders the segments during the drag;
`onDragEnd` (or the arrow nudge) persists the adjusted `legs` via
`TripProvider.updateTripFrame`. Unblocks #34 (variations over a forked range).

Verified in-browser on the Slovenia trip: 2 handles between Ljubljana/Bled/Piran;
a pointer drag previewed then committed Bled 4n→6n / Piran 5n→3n; the keyboard
nudge moved one day and clamped Ljubljana at its 1-day floor; reload confirmed
the canonical trip untouched (the dev user can't write — RLS owner-only).

## Accessibility (#38)

The trip surfaces are keyboard- and screen-reader-navigable:
- **Nav:** Trips views are real links (URL-per-view) with `aria-current`; the
  context strip and rails are labelled `nav`s.
- **Rows:** every clickable non-button (entry/flight/stay/shelf rows) is
  `role=button` + `tabIndex` + `aria-label`, activates on Enter/Space, and has a
  visible `:focus-visible` outline.
- **Editor:** EntryEditor is `role=dialog aria-modal`, closes on Escape, focuses
  its first field.
- **Drag:** DayEntries reorder + the TripWindow boundary handles both work from
  the keyboard (arrow keys); the Solve result is an `aria-live` status region.
- **Grid:** the grid is a labelled `role=group`; every block carries an
  `aria-label` with its time (e.g. "Land in Frankfurt, 14:00–14:30").
- **Map:** leaflet pins aren't exposed to AT, so an `.sr-only` ordered list of
  the placed stops (in trip order, with day + place) is the text alternative.
- **Contrast:** the category palette passes WCAG AA — white-on-leg-colour ranges
  5.46–9.84:1, status badges 5.25–8.53:1 (verified).

## Variations / forks — the "what-if" tab (#34)

Fork a stretch of the trip into two futures and keep both alive until you
decide. The model is additive (a no-op on every existing trip):
`trip.options.forks = [{ id, name, range, choices:[A,B], activeChoiceId }]`, and
an entry may carry `option:{forkId, choiceId}` (omitted ⇒ a base entry, always
shown). Pure core in `lib/trip-variations.js` (`activeEntries`, `forkForDay`,
`choiceCounts`, `forkDecideBy`, `entriesForChoice`, `setActiveChoice`),
unit-tested in `test/trip-variations.test.mjs`.

- **Fork composer** (`components/TripVariations.jsx`, the **Forks** tab): name +
  from/to over the trip's days → creates the fork in a **single atomic frame
  write**. The in-range untagged entries become Option A *implicitly*
  (`activeEntries`/`entriesForChoice`/`choiceCounts` via `implicitFirstChoice`),
  so there's no per-entry tag burst that could land after the fork metadata and
  let another client briefly see a fork with no entries (#62). Option B starts
  blank.
- **Switch:** clicking a choice card sets `activeChoiceId`; the whole workspace
  follows because `TripWorkspace` feeds the read panels a **variation-filtered
  `vtrip`** (`activeEntries`) — Days/Grid/Map/Book/Frame + the rollups all show
  the live option. Entries added on a forked day inherit the live choice.
- **decide-by:** the earliest cancellation deadline across either option, shown
  as a countdown (turns urgent ≤7 days).
- **Compare:** a side-by-side A vs B column list, the live one ringed.

Verified in-browser on the Slovenia trip: forking 05-21–05-25 tagged 36 entries
to Option A; switching to the blank Option B dropped those days to 0 while the
base days were untouched; switching back restored them; the compare showed both
columns. (Optimistic-only on the dev user — RLS owner-only — so the canonical
trip stayed clean on reload.)

Deferred follow-up: **auto-release of refundable holds** when an option loses —
that's a background automation (a scheduled job watching `decide-by`), out of
scope for the UI build; tracked for later.
