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

- **Plan** — [TripWindow](../components/TripWindow.jsx) (date ribbon + colour-coded
  leg bars) · Stays summary · per-leg [GatherBucket](../components/GatherBucket.jsx)
  (browse the pois cache near a leg, ranked by rating × log(reviews); save lands
  on the **Shelf**).
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
