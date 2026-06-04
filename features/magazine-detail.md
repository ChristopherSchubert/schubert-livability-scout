# Magazine-format city detail (redesign)

A long-form, chapter-based redesign of the per-city detail page —
cinematic hero, editorial floating TOC, six chapters (Set the scene →
The why → Where you'd live → By the numbers → When to go → Six blocks).
Replaces the current dashboard-card layout at `/cities/[slug]`.

## How it works today

- **Mockup**: [public/city-detail-redesign.html](../public/city-detail-redesign.html) (Newport,
  ~2.6k lines, static). Demonstrates the full chapter container, the
  floating editorial TOC, the chapter transitions, and inline use of every
  other feature documented under `features/`.
- **Live route**: `/cities/[slug]` → `CityDetailRoute` →
  `CityDetail` in [components/PlannerShell.jsx](../components/PlannerShell.jsx)
  still renders the old card layout. The redesign is **not wired up**.

## Status

- Mockup: complete, static, viewable at `/city-detail-redesign.html`.
- Live route: unchanged from pre-redesign dashboard layout.
- TODO #4 in the project TODO is the wire-up.

## TODOs / future direction

- **Wire the chapters into the real route.** Each chapter should be a
  React component fed from `cityItem` so the live page mirrors the mockup.
- **Floating editorial TOC.** Mockup has it; the React port needs it too —
  jump links, active-section highlighting.
- **Performance.** The mockup is one HTML file with inline SVGs; the React
  port needs to chunk per chapter so initial render isn't blocked by the
  visit-window chart's many SVG elements.
- **Mobile.** The mockup is laid out for desktop reading; mobile needs
  chapter-collapsing or a different navigation pattern.
- **Sectional cross-features.** Several chapters depend on features that
  exist only in the mockup today — see [visit-window.md](visit-window.md),
  [baseline-comparison.md](baseline-comparison.md),
  [six-blocks.md](six-blocks.md), [why-prose.md](why-prose.md). The
  redesign's wire-up should land alongside (or after) those.
