# Stay-zone map + boundary

The interactive map on the city detail page showing the walkable area
the candidate is judged on. Backed by a real polygon (`stay_zone_boundary`
on the row), with the measurement field (the 700 m densest-cluster
inside the polygon) overlaid for transparency.

## How it works today

- **Boundary data**: `cities.stay_zone_boundary` jsonb, populated by
  `fetchStayZoneBoundary` in [lib/measure.js](../lib/measure.js). Cascade:
  Census Place / CDP → OSM polygon → OSM reverse-geocode → Census Tract
  → NRHP historic district → point-circle → 2 km anchor circle. Filters:
  polygon area in [0.5, 30] km², pin must be inside the bbox.
- **Measurement field**: `measureAround(lat, lon, { boundary })` calls
  `findVisitCenters` to locate the densest 700 m cluster inside the
  polygon, then runs every OSM-based measurer at that center. The saved
  pin is not moved by routine re-measure — only an explicit user drag.
- **Provenance**: `boundary_source` + `boundary_set_at` columns track how
  the boundary was resolved.
- **Render (live)**: `MapEmbed` in
  [components/MapEmbed.jsx](../components/MapEmbed.jsx) — currently a
  query-driven embed (no polygon overlay).
- **Render (mockup)**: chapter 3 of [public/city-detail-redesign.html](../public/city-detail-redesign.html) uses
  a real interactive Leaflet with a polygon overlay, score-overlay
  top-right, and a stay-zone candidates list bottom-left.

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
- **Highlight the measurement center.** Mockup shows it; live route
  doesn't. Helps the owner see "the score is for *this* 700 m, not
  wherever the pin was originally dropped".
- **Drag-to-recenter** (live route already supports drag-on-API; the UI
  needs to call it). Dropping a new pin triggers `refreshBoundary` +
  re-measure via `/api/measure`.
- **Boundary-source UI.** The mockup is silent on this, but exposing
  `boundary_source` (e.g. "Census Place" vs "anchor-circle") on hover
  would help the owner know how trustworthy the polygon is.
- **The anchor-circle fallback is provisional.** Cities sitting on an
  800 m anchor-circle should be visually flagged in the Board ("no real
  boundary yet") so they get attention.
