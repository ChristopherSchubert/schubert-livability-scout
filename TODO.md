# TODOs

Six sessions on this project got cut off mid-work. One entry per session,
with where we left off and the next move. (2026-06-03 sweep.)

## 1. Missing city metrics — IN PROGRESS

**Where we left off (resumed 2026-06-03 ~18:00):** Local Overpass import was
running; corpus had grown 69 → 78. Audited Supabase: climate axis populated
78/78 but `climate_extremes` only on Newport.

**What landed this session:**
- ✅ **Climate axis (full corpus).** Swapped `measureClimate` from Open-Meteo
  (rate-limited us to ~14 cities/hour) to NASA POWER (MERRA-2). All 78
  cities refreshed in ~3 min, 0 errors. `climate_extremes` 1/78 → 78/78;
  `visit_climate` re-derived with the new source. Methodology changes:
  `clear_days` now `ALLSKY/CLRSKY radiation ≥ 0.7`; `annual_snow_in` is null
  (POWER has no snowfall — honest blank).
- ⏳ **Overpass-backed measurers.** Waiter polling
  `http://localhost:12345/api/interpreter` every 60s. Import has progressed
  from osmium convert → indexer; level-1 merge files at `1h` of (likely)
  `1p`, level-0 chunks for batch `1i` currently writing. Several hours more.

**Still owed when Overpass is ready:** ~45 cities for OSM core
(`cafe_n`/`rest_n`/`bar_n`/`street_km`/`intersection_den`/etc.), 44 for water,
43 for `bldg_coverage`, 77 for the new measurer columns (`admin`, `terrain`,
`osm_context`). The waiter will fire `onboard.mjs` automatically; output
streams to `overpass/onboard.log`.

**Open:** `viewshed_km2` isn't producible by the current pipeline (DEM-based
calc — separate conversation). `str_share_pct` was retired 2026-06-03:
AirDNA was the only source that met the "identical ruler across all cities"
rule, and a scrape probe showed Airbnb rounds counts ("Over 1,000") for any
market we care about. `seasonal_vac_pct` is now the canonical hollowing
signal; the `tourist-heavy` and `year-round` chips were rewritten against it.

## 2. Local Nominatim setup

**Where we left off:** Local Nominatim + Overpass stack stood up; Newport
measured end-to-end as the validation case. Designed a chip vocabulary
(coastal, peninsula, year-round, tourist-heavy, college town, etc.) derived
from `measuredMetrics` + a small bundle of new derived signals (coastline
distance, local relief, STR share). You pushed back: *"I hate the tier. The
chips are kinda stupid but I like coastal and peninsula."* I asked: trim
vocabulary first, or code as-is with a TODO list of missing signals? You
didn't answer.

**Next move:** Chips stayed (you decided you liked them). `drive_hrs_from_PIT`
landed as a top-line attribute (seed in `lib/planner-data.js`, rendered above
the chips strip). Still open: intersection-angle entropy (needs osmnx).

## 3. Board image collapse feedback — DONE

**Where we left off:** Boundary + measurement unified end-to-end. Boundary
chain hoisted from the (now-deleted) backfill script into
`lib/measure.js#fetchStayZoneBoundary` — Census Place → OSM polygon → OSM
reverse-geocode → Census Tract → NRHP HD → point-circle → 2 km anchor circle.
Size cap raised to 30 km², floor to 0.5 km², real polygon area (shoelace)
replaces bbox. `measureAround` now takes `{ boundary }` and places the 700 m
field at the densest cluster inside it — the saved pin no longer determines
where measurement happens. Coverage 78/78; `boundary_source` + `boundary_set_at`
columns track provenance. The API (`POST /api/measure`) cascades automatically:
lazy-fetches the boundary if missing, refreshes on `refreshBoundary: true` or
when the user drops a new pin, then re-measures.

## 4. Hero images for cities

**Where we left off:** 69/69 cities have heroes (Supabase covers the whole
list). Conversation then pivoted twice:
- You sketched a magazine-style city detail redesign (cinematic hero → heart
  → stay-zone map → numbers). The static mockup is at
  `public/city-detail-redesign.html` (Newport, 1985 lines), but the live
  `/cities/[slug]` route still renders the old dashboard layout.
- You complained the "January" axis still sucks — the 3 metrics ("jan high",
  "dec daylight", "clear days/yr") don't capture what you want. Asked for a
  rebrand + year-shape + auto worst-month-per-direction.

**Next move:** Two threads. Either (a) wire the magazine mockup into the
real route, or (b) draft a January-axis methodology proposal. Also a soft
follow-up: reposition the Litchfield pin (landed off the Green).

## 5. City "why" quality audit — DONE (2026-06-03)

Closed out. The audit and cleanup landed earlier; the 71d7f62 rewrite
covered the 69 long-form whys; the 9 eastern-seaboard additions (Bristol
RI, Essex CT, Lewes DE, Litchfield CT, Mystic CT, New Castle DE, Newport
RI, Northampton MA, Old Town Alexandria VA) got rewritten in the matching
two-paragraph form (geography/fabric → case + honest tradeoff + "you'd
be testing…"). All 78 candidate cities now sit in the 800–1600 char band;
the remaining short whys belong to the 9 calibration/benchmark places
(Pittsburgh-area controls + Slovenia originals), which is intentional.

## 6. Repository design analysis

**Where we left off:** Full architecture audit done; Selection Board / five-
stage funnel landed; CityNav exists. The next slices identified but not
started:
- **Visit Plan rebuild** — timeline view with logistics / days / checklists
  rails.
- **Journal mode** — auto-activates when today falls in
  `arriveDate`–`departDate`; phone-friendly; one-tap entries during a visit.

**Next move:** Pick one of those two and build it. Journal mode is the one
you said matters most "when you're walking around the city".
