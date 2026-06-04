# Visit window (Charm + Truth)

Two diagnostic trips computed per city from climate normals + crowd
season: **Charm** (the month that's comfortable *after* crowds thin) and
**Truth** (the coldest month — the January test made literal). A
candidate should pass both before it advances.

## How it works today

- **Data**: `cities.visit_climate` (12 monthly normals from NASA POWER),
  `cities.crowd_season` (12 ints 0–5, qualitative), `cities.season_notes`
  (`{ charm, truth }` prose).
- **Logic**: `cityVisitWindow(cityItem)` in
  [lib/planner-data.js](../lib/planner-data.js) returns
  `{ charm: {idx, name}, truth: {idx, name}, notes, comfort[], crowd[] }`.
- **Render (live)**: `VisitPlan` in
  [components/PlannerShell.jsx](../components/PlannerShell.jsx) — header
  cards for Charm + Truth, then a 12-month strip with `charm`/`truth`/`now`
  classes per month tile.
- **Render (mockup)**: chapter 5 of [public/city-detail-redesign.html](../public/city-detail-redesign.html) — a
  much richer SVG chart with comfort curves, crowd curves, Charm and
  Off-season annotations, dot markers, and a "year-shape" section
  comparing the candidate vs Allison Park across HIGH / LOW / PRECIP.

## Status

- Charm + Truth selection logic works against POWER-derived `visit_climate`.
- Notes are qualitative; `crowd_season` is hand-set.
- Live render is the compact strip — useful but not the magazine layout.
- Year-shape and curves only exist in the mockup.

## TODOs / future direction

- **Year-shape: worst-month-per-direction.** Mockup shows HIGH / LOW /
  PRECIP rows with the auto-pulled worst month in each direction vs
  Allison Park baseline. Methodology needs writing up — TODO #4 calls
  this out as "January-axis methodology proposal".
- **Comfort + crowd curves.** SVG visualization in the mockup; not in
  live render.
- **Charm/Off-season annotations on the chart.** Mockup has them; live
  render only has the header cards.
- **`crowd_season` data.** Hand-set today; lots of cities have null.
  Worth considering a real source (visitor-bureau seasonality, Google
  Trends, etc.) — but watch the "identical ruler across cities" rule.
- **POWER-derived snowfall is null.** January chapter loses a signal until
  the NOAA NCEI snowfall measurer fills `snowfall_in_yr` for the rest of
  the corpus (in progress, 73/78).
