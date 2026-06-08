# Magazine-format city detail

A long-form, chapter-based per-city detail page — cinematic hero, editorial
floating TOC, six chapters (The scene → The why → Where you'd live → By the
numbers → When to go → Where to walk). This is the live layout at
`/cities/[slug]`, replacing the old dashboard-card layout.

## How it works today

- **Live route**: `/cities/[slug]` → `CityDetailRoute` →
  [components/city-detail/MagazineDetail.jsx](../components/city-detail/MagazineDetail.jsx),
  wrapped in `AppShell` (which supplies the city-context strip — the mockup's
  `.strip` is intentionally NOT re-rendered).
- **Data**: every chapter is fed by the single shared shaper
  [lib/city-detail-view.js](../lib/city-detail-view.js) `buildCityDetailView()`,
  called in-process from the planner's `cityItem`. The same shaper backs
  `/api/mockup-data`, so the live page and the static mockup can't drift.
- **Chapters**:
  - `MagazineDetail.jsx` — orchestrator + Scene, Why, and Walks (six blocks).
  - [ChapterData.jsx](../components/city-detail/ChapterData.jsx) — the five axes,
    rebuilt from the snapshot (only real taxonomy metrics, each with its source
    or an honest "—").
  - [ChapterWhen.jsx](../components/city-detail/ChapterWhen.jsx) — the comfort
    ribbon, the climatology small-multiples (vs the Allison Park home base), and
    the year-shape extremes strip. **All SVG paths are computed from the city's
    real monthly normals** — none of the mockup's hand-pinned Newport numbers
    survive. Honest "pending" stub when a city has no climate.
  - [WhereMap.jsx](../components/city-detail/WhereMap.jsx) — read-only Leaflet
    map (client-only via `next/dynamic`): the real `stay_zone_boundary`
    polygon, the saved visit pin, and the 700 m measurement field.
  - [FloatingToc.jsx](../components/city-detail/FloatingToc.jsx) — the editorial
    chapter rail; scroll-driven active-section highlight, reveals after the Why.
    `position: fixed; right: 0`, living in a **reserved right lane** (`--rail-
    gutter`, 4rem). Every centered text/data section (`.why`, `.where-head/foot`,
    `.data`, `.when`, `.walks`) adds that much right padding so the rail's
    numerals never touch the content — at *any* width (verified clearance ≥26px
    from 700→1700px). Full-bleed sections (hero, where-map) opt out and let the
    rail float over them; the left-fading gradient scrim is its legibility layer.
    On **phones (≤640px)** the rail is hidden and `--rail-gutter` drops to a
    normal 1.25rem so content reclaims the lane (the top nav + in-page tabs cover
    wayfinding there).
    - **One small form at every width.** At rest the rail is numerals only (no
      width-based hide/disclose bands — resizing never pops titles in or out).
      On hover/focus the titles slide out *to the left* of the numerals as an
      overlay; `flex-direction: row-reverse` keeps the numerals pinned at the
      right edge so they don't shift. The expanded state swaps to a near-opaque
      background gradient (`:hover/:focus-within`) so titles stay legible over
      the content they cover.
    - **Gotcha:** the title toggles via `display` (none↔block), *not* an
      animated `width`/`max-width`. In this shrink-to-fit fixed rail, a grid/flex
      item with `overflow:hidden` contributes zero intrinsic width, so a width
      animation silently collapses the track to 0 and the title never appears.
  - **Grid blowout guard.** The axis grid (`.axes`) and the climate heatmap
    (`.climate-heatmap`) both use `repeat(N, minmax(0, 1fr))`, **not**
    `repeat(N, 1fr)`. Plain `1fr` is `minmax(auto, 1fr)`, so a `white-space:
    nowrap` source citation (or a `grid-column: 1/-1` legend) inflates the
    tracks past the container and the grid overflows the viewport — which was
    shoving column 5 off-screen and sliding content under the rail. The
    `minmax(0, …)` floor lets tracks shrink so `text-overflow: ellipsis`
    actually engages. `.axes` also steps 5→3→2→1 columns down the width range.
- **Styles**: [app/city-detail.css](../app/city-detail.css), ported from the
  mockup and **scoped under `.cd-root`** so the generic class names
  (`.hero`, `.data`, `.metric`, `.eyebrow`…) never collide with `globals.css`.
  The paper/ink palette lives on `.cd-root`, not `:root`. Fraunces + Inter
  Tight are loaded by `<link>` in `app/layout.js`.
- **Mockup**: [public/city-detail-redesign.html](../public/city-detail-redesign.html)
  remains as the design reference; it fetches `/api/mockup-data`.

## Status

- Live route: **shipped.** Verified against Newport (full data), Litchfield
  (low score, full data) — hero, why, where-map, axes, when-charts, walks all
  render with no console errors; `next build` passes.
- The comfort ribbon shows the crowd line only when `crowdSeason` exists (today
  just the two seeded cities) — otherwise comfort + visit-score only, honestly.

## TODOs / future direction

- **Candidate cores on the Where map.** `findVisitCenters` runs server-side and
  isn't in the envelope, so the map shows the boundary + pin + field but not the
  ranked core list / click-to-reselect from the mockup. Surface it via a
  `visit_cores jsonb` column (refreshed by `/api/measure`) or a client compute.
- **Six blocks need coordinates.** `cityItem.blocks` are names only, so each
  walk card links to a map search rather than a precise mini-map pin. See
  [six-blocks.md](six-blocks.md).
- **Mobile.** The ported CSS carries the mockup's `@media` rules; verify the
  chapter rail + climatology behave on small screens.
- **Crowd data.** Only two cities are seeded; the ribbon's crowd line stays
  hidden until `crowdSeason` is measured/seeded more widely.
- **Retire the old layout.** `CityDetail` in `PlannerShell.jsx` is now orphaned
  (no importer) — delete it in the PlannerShell split (Plan 3).
