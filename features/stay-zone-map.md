# Stay-zone map + boundary

The interactive map on the city detail page showing the walkable area
the candidate is judged on. Backed by a real polygon (`stay_zone_boundary`
on the row), with the **plateau-decay walking-core measurement field**
overlaid for transparency. The measurement field used to be a hard 700 m
disk; it's now a soft-edged catchment whose weight as a function of
distance from the anchor follows
[features/walking-core.md](walking-core.md).

## How it works today

- **Boundary data**: `cities.stay_zone_boundary` jsonb, populated by
  `fetchStayZoneBoundary` in [lib/measure.js](../lib/measure.js). Cascade:
  Census Place / CDP → OSM polygon → OSM reverse-geocode → Census Tract
  → NRHP historic district → point-circle → 2 km anchor circle. Filters:
  polygon area in [0.5, 30] km², pin must be inside the bbox.
- **Measurement field shape**: plateau-decay (500 m full credit / 400 m
  decay constant / 1500 m outer cutoff). Drawn as a solid green plateau
  disk, an 800 m dashed reference ring (10-min shed), and a 1500 m
  dashed outer cutoff. POI dots are layered on top with opacity equal
  to the precomputed decay weight, so the reader can see which POIs
  are contributing how much. See [walking-core.md](walking-core.md).
- **Anchor location**: For the four `_score` metrics
  ([lib/measurers/walking-core.js](../lib/measurers/walking-core.js)) the
  anchor is currently the saved visit pin. The osm-core measurer still
  uses `findVisitCenters` to slide to the densest cluster inside the
  polygon, but walking-core hasn't been wired into the adaptive logic yet
  — see TODOs.
- **Provenance**: `boundary_source` + `boundary_set_at` columns track how
  the boundary was resolved.
- **Render (live)**:
  [components/city-detail/WhereMap.jsx](../components/city-detail/WhereMap.jsx)
  — react-leaflet, client-only via `next/dynamic`. Draws the boundary
  polygon, the plateau / 800 m / 1500 m rings, the POI dots (from
  `cities.poi_positions`), and the pin. Reads `poiPositions` from
  `cityItem` round-tripped via [lib/city-row.js](../lib/city-row.js).
- **Full-screen view**: `/cities/[slug]/walking-core` →
  [components/walking-core/WalkingCoreView.jsx](../components/walking-core/WalkingCoreView.jsx).
  Atlas-style spread with floating headline, parameter spec, weighted
  breakdown. Linked from Chapter III's overlay panel.

## Status

- **Boundary coverage**: 78/78 (per TODO #3, closed). Anchor-circle
  fallback guarantees every row has *something*.
- **Boundary cascade**: live; lazy-fetches via `/api/measure` if a row's
  boundary is stale.
- **Polygon-on-map UI**: only in the mockup. Live `MapEmbed` shows tiles
  but no boundary overlay.

## TODOs / future direction

- **Render the polygon on the live map.** Leaflet (or MapLibre) with a
  filled overlay matching the mockup. The data is there — only the UI
  layer is missing.
- **Adaptive centering for walking-core**. The walking-core measurer
  uses the saved pin; osm-core slides to the densest 700 m cluster via
  `findVisitCenters`. Wire walking-core through the same adaptive path
  so the score is "best 1500 m within the stay zone," not "1500 m
  around the saved pin." See TODO at the end of
  [walking-core.md](walking-core.md).
- **Drag-to-recenter** (live route already supports drag-on-API; the UI
  needs to call it). Dropping a new pin triggers `refreshBoundary` +
  re-measure via `/api/measure`.
- **Boundary-source UI.** The mockup is silent on this, but exposing
  `boundary_source` (e.g. "Census Place" vs "anchor-circle") on hover
  would help the owner know how trustworthy the polygon is.
- **The anchor-circle fallback is provisional.** Cities sitting on an
  800 m anchor-circle should be visually flagged in the Board ("no real
  boundary yet") so they get attention.
