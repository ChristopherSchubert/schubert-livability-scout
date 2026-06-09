# Six blocks

A short, curated list of specific blocks / wharves / streets to walk in
each city — the "where to stand to see what this place actually feels
like" list. Five to seven entries per city, each a single sentence-or-
less location string.

## How it works today

- **Data (block names)**: `cities.blocks` jsonb — an array of strings
  like `"Thames Street at Howard Wharf"`, `"Spring Street between Touro
  & Mill"`. Populated at insert time (UI *+ Add candidate* or
  [scripts/onboard.mjs](../scripts/onboard.mjs)). The target is 5–7 per
  city — the "Six blocks" header is the column's name, not a hard count;
  small towns honestly land lower rather than getting padded.
- **Authoring candidates (Google Places + DBSCAN)**: when a city has too
  few blocks, [scripts/.gen-block-candidates.mjs](../scripts/.gen-block-candidates.mjs)
  proposes new ones from real social-POI density — it never invents. A
  block is a *spot* (an intersection or named place), found with a
  principled two-layer algorithm rather than hand-tuned thresholds:
  1. Read social POIs (food/drink + stroll retail + arts/culture) within
     ~1 km of the pin from the **local `pois` cache** — a Supabase table
     populated from **Google Places** (Nearby Search New) by
     [scripts/.fetch-pois.mjs](../scripts/.fetch-pois.mjs), which tiles
     each city (the API caps at 20 results/call), dedupes by place id, and
     stores the full Enterprise field set (rating, userRatingCount, types,
     priceLevel, businessStatus, street). Google is hit **once per city**;
     generation runs offline against the cache. Permanently/temporarily
     **closed places are excluded**. **Why Google, not OSM:** OSM POI
     coverage is too thin — it had *zero* of The Wine Cave, Tú y Yo Café,
     Barrel Junction (all real, hundreds of reviews) and showed Lewisburg
     WV / Verona as near-empty when Google finds 20+. Treating OSM's
     absence as "no social life" was the classic *zero-is-not-null* trap.
     Car/big-box types are omitted so suburbs don't false-inflate (Allison
     Park still reads ~0, correctly). **No polygon clip** — the saved
     `stay_zone_boundary` is often mis-sized (Saratoga's clipped 69 of 95
     POIs), so we work from density.
  2. **DBSCAN** (`eps` ~85 m, `minPts` 3) finds the genuine dense
     region(s) and labels sparser POIs as noise → dropped. This is the
     honest cut-losses rule.
  3. **Within each region, sample spaced spots** — densest point, snap to
     local centroid, drop within ~140 m, repeat. Small spacing keeps
     adjacent streets distinct (Saratoga's Broadway vs Caroline); a
     **per-street cap (3)** stops one spine (East Carson) being sampled
     six times. A wide blob becomes several spots; a long strip a few
     corners.
  4. **Name** each spot from the majority street of its POIs (Google
     `addressComponents.route`, canonicalized so "E Carson St" matches
     OSM's "East Carson Street") crossed with the nearest intersecting
     street from OSM geometry (`"East Carson St & South 15th St"`), or the
     named feature there from OSM (`"Pritchard Park"`). Rank by density,
     cap at six; the count is whatever the data supports.

  OSM still provides **street geometry + parks/squares** (well-mapped);
  Google provides the **POI signal** (coverage). The Google key lives in
  the macOS Keychain (`account livability-scout`, service
  `google-places-api-key`); the script reads it there or from
  `GOOGLE_PLACES_API_KEY`/`GKEY`. It **prints proposals for review and
  never writes**. `--all --json` dumps the corpus;
  `.format-block-proposals.mjs` renders a reviewable doc;
  `.save-block-proposals.mjs --commit` applies picks (excludes the
  Slovenia anchors + Allison Park homebase). After saving, re-run the
  measurer below to resolve coordinates.
  **Allison Park is the owner's home** — its pin is a residential
  address, not a downtown, so ~0 walkable POIs is the correct, expected
  reading, not a coverage bug. It's the familiar place the owner compares
  others against. Describe it neutrally as a home; do not "fix" it. (See
  CLAUDE.md Corollary 3 — no place is "set up to look bad.")
  **NOTE:** the measured Aliveness metrics (`cafe_n`/`bar_n`/`rest_n` in
  `lib/measure.js`) still come from OSM and carry the same coverage gap —
  a known follow-up, not yet migrated to Google.
- **Durable baseline + idempotency** (migration 0009). The generator ADDS
  to a human baseline; that baseline lives in `cities.blocks_authored`
  (never written by the pipeline), so `blocks = blocks_authored + picks`
  and a re-run always rebuilds from the baseline — it can't compound, and
  doesn't depend on any temp file. The save skips the write when the result
  is unchanged (so it won't needlessly clear `block_geometries` and wipe
  resolved pins). The generator **fails loudly** ("no cached POIs in
  range") if a city was never fetched into the `pois` cache, instead of
  silently producing 0 blocks. *Residual:* cross-street names still come
  from live Overpass, so they drift slightly run-to-run — a re-save would
  rewrite a few cities' block strings (churn, not compounding); caching the
  OSM road data would make naming deterministic too.
- **Data (block coordinates)**: `cities.block_geometries` jsonb — an
  array parallel to `blocks`, each entry shaped like
  `{ name, lat, lon, accuracy, source, meta, asOf }` with `accuracy`
  drawn from this scale (highest trust first):

  | Tier | Source | When |
  |---|---|---|
  | `manual` | hand-edited row | human always wins; idempotent across `--force` |
  | `heart-snap` | the city's `heart_intersection` | block names both heart streets → snap to pin |
  | `exact` | Overpass intersection, gap < 10 m | two named ways share a node |
  | `between` | Overpass, two flanking intersections | midpoint of the stretch |
  | `near` | Overpass, gap 10–60 m | close-but-not-shared nodes |
  | `feature` | Overpass `nwr["name"=…]` centroid | parks, wharves, plazas |
  | `nominatim` | Nominatim viewbox-bounded search | Overpass exhausted; bbox rules out cross-county collisions |
  | `unresolved` | gate rejected the hit | `lat: null` — UI shows placeholder |

  Populated by [lib/measurers/blocks.js](../lib/measurers/blocks.js)
  via `node scripts/onboard.mjs --measurer blocks`. The runner is
  idempotent: a populated array means "skip" unless `--force` is
  passed, and manual entries survive `--force`.

- **Integrity gate.** After any resolution, the candidate point must
  either be inside `cities.stay_zone_boundary` (when that polygon
  exists) or within 5 km of the city pin. Failures are demoted to
  `accuracy: "unresolved"`, `lat/lon: null`, with the rejected
  coordinate preserved in `meta.rejected` for debugging. This is the
  guardrail that catches silent wrong-segment matches — the failure
  mode an earlier session hit when "Main St, Ventura, CA" geocoded to
  a Castaic Main St 48 km away.
- **Per-block images**: `cityItem.blockImages` mirrors the array shape
  with one image query per block (auto-generated by
  `blockImageQuery(cityName, block)` in
  [lib/planner-data.js](../lib/planner-data.js)).
- **Render (live)**: Chapter VI of
  [components/city-detail/MagazineDetail.jsx](../components/city-detail/MagazineDetail.jsx)
  (`ChapterWalks`) renders one card per block. When
  `block_geometries[i]` has a confident coord (anything except
  `unresolved`), it embeds a read-only Leaflet mini-map
  ([components/city-detail/BlockMap.jsx](../components/city-detail/BlockMap.jsx))
  — OSM tiles, no controls, dark double-ring marker, the same recipe
  the mockup uses. Zoom is derived from `accuracy` (intersections get
  z18, features and Nominatim hits get z16). When the entry is
  `unresolved`, the card falls back to a paper-colored placeholder.
  Either way, the whole `.walk-map` area is overlaid by a transparent
  anchor that deep-links to Google Maps search for `"{block}, {city}"`.
- **Render (mockup)**: chapter 6 ("Six blocks") of
  [public/city-detail-redesign.html](../public/city-detail-redesign.html)
  is the original — same Leaflet recipe, hard-coded lat/lon per block.

## Status

- **Data layer (blocks)**: backfilled corpus-wide (2026-06-07) via the
  Google Places + DBSCAN generator. **106 of 117** candidate cities carry
  a full 6; the rest land lower by honest density (small towns: Jim Thorpe
  2, Lewisburg WV / Sewickley 3, Beacon / Verona 4). The 4 reference places
  (Bled, Piran, Ljubljana, Allison Park) carry none — they're the owner's
  known benchmarks, not scored candidates, so the generator skips them.
  An earlier OSM-only pass undercounted badly (only 72 reached 6, Lewisburg
  read as ~0) — switching the POI signal to Google fixed it. New blocks
  came from [scripts/.gen-block-candidates.mjs](../scripts/.gen-block-candidates.mjs),
  reviewed — see "Authoring candidates (Google Places + DBSCAN)" above.
- **Data layer (block_geometries)**: resolved by the `blocks` measurer.
  Re-run with `--force` after any block edit (it re-evaluates every
  non-`manual` entry through the strengthened resolution chain). Typical
  city resolves 5–6 of 6 via Overpass intersections + feature centroids,
  with Nominatim catching the rest; a few stay `unresolved` (placeholder
  card) when no layer can place them inside the stay zone.
- **UI layer**: wired. The Chapter VI header reflects the real block
  count ("Six blocks" / "Two blocks", not a hard-coded six). Embedded
  mini-maps render wherever `block_geometries[i].accuracy !==
  "unresolved"`.

## Fallback pins for un-geocodable editorial blocks

Hand-authored blocks often name landmarks OSM under-maps ("Bowens Wharf",
"Cap Sante marina", "Wisp Resort base village") — Overpass + Nominatim
can't place them, but Google text-search can.
[scripts/.fallback-pins.mjs](../scripts/.fallback-pins.mjs) Google-resolves
every still-`unresolved` block, gates it tightly (inside the stay-zone
polygon OR within 2.5 km of the pin — a wrong pin is worse than a
placeholder), and writes the hit as a `block_geometries` entry with
`accuracy: "manual"`. The measurer's Layer 0 **preserves `manual` entries
verbatim across `--force`**, so these are permanent fallbacks the pipeline
never recomputes. Source recorded as `google-fallback`. (2026-06-09: took
the corpus from 629→670 of 675 pins; the 5 holdouts are genuinely-distant
drive-to features — Blue Ridge Parkway overlook, Canaan Valley Resort —
left as honest placeholders.)

## The 1.5 km audit (2026-06-09)

A pin being "resolved" doesn't mean it's in the right place — the
measurer's 5 km integrity gate had accepted same-named streets/features
up to 5 km from the center (Salem's downtown "Washington St" pinned 4 km
out). Audited every pin against the ~1.5 km walkable circle:
- **[.reresolve-far.mjs](../scripts/.reresolve-far.mjs)** — for each pin
  outside 1.5 km, re-geocode with a *tight* bias around the center and
  accept only a result inside the zone / closer; snapped **50 misplaced
  pins** back to the correct downtown spot.
- **[.cleanup-blocks.mjs](../scripts/.cleanup-blocks.mjs)** — drop blocks
  that point to drive-to features (Blue Ridge Parkway overlook, a ski
  base, a state-park beach — not walkable) from `blocks` /
  `blocks_authored` / `block_geometries`; re-pin the rest (a "between Y
  and Z" block → midpoint of its neighbour blocks; a bare street → nearest
  OSM intersection of that street to the pin).
- **[.snap-intersections.mjs](../scripts/.snap-intersections.mjs)** — lock
  a block to the nearest real intersection rather than a random business.

Result: **118/118 cities fully resolved, 0 unresolved.** ~12 pins sit
1.5–3.8 km out and are *kept on purpose* — genuine destination walks in
spread-out towns (West Cliff/Lighthouse Point, the Pacific Grove
waterfront, Kailua beach). Lesson: judge pins by *correctness*, not just
resolved-vs-unresolved counts.

## TODOs / future direction

- **Finish the backfill.** Run `node scripts/onboard.mjs --measurer
  blocks --force` corpus-wide. With the public Overpass mirror this is
  slow (~25–45 min); with `OVERPASS_URL=` pointing at a local container
  it's a few minutes. Re-run after any block string edit too.
- **Manual override UI.** Right now an `accuracy: "manual"` entry is
  preserved across re-runs but there's no surface to *create* one.
  Add a "drop pin here" affordance on the placeholder card so the
  owner can correct an `unresolved` entry without leaving the page.
- **Block image search.** Today the query is auto-generated. A search /
  paste-URL flow per block (mirroring the hero image pattern) would let
  the owner curate. Without it, block images are best-effort and often
  off-target.
- **Surface accuracy in dev/debug.** A tiny corner badge or border tint
  per card (`heart-snap` / `exact` / `between` / `near` / `feature` /
  `nominatim`) would make data quality legible at a glance during
  onboarding QA. Off by default.
- **Re-ordering / pruning.** Today block order is insertion order; the
  owner can't reorder without editing the row. A small drag-to-reorder
  UI alongside the curate flow would help — and would need to reorder
  `blocks` and `block_geometries` together.
- **Tie blocks to the in-trip Journal mode** (TODO #6) — when the owner
  is in the city, each block gets a tap-to-rate entry.
