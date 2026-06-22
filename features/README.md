# Features

One markdown file per major feature of Livability Scout. Each file documents:

- **What it is** — one paragraph, plain English.
- **How it works today** — the actual code path, file by file.
- **Status** — what's working, what's partial, what's broken.
- **TODOs / future direction** — known gaps + ideas the owner hasn't ruled out.

When you change a feature, update its file in the same diff. Stale feature
docs are worse than no feature docs.

## Index

| Feature | File | Status |
|---|---|---|
| Onboarding a new city | [city-onboarding.md](city-onboarding.md) | documented |
| Magazine-format city detail (redesign) | [magazine-detail.md](magazine-detail.md) | stub — wire-up pending |
| Why prose (why / if-wins / if-fails) | [why-prose.md](why-prose.md) | stub |
| Stay-zone map + boundary | [stay-zone-map.md](stay-zone-map.md) | stub — data live, polygon UI pending |
| Walking core (plateau-decay measurement field + full-screen view) | [walking-core.md](walking-core.md) | documented; rolled out 2026-06-08 |
| Measurer pipeline (objective data → Supabase) | [measurer-pipeline.md](measurer-pipeline.md) | documented; per-key coverage in [METRICS_COMPLETION.md](../METRICS_COMPLETION.md) |
| Chips (city attribute strip) | [chips.md](chips.md) | documented |
| Visit window (Prime + Off-season months) | [visit-window.md](visit-window.md) | stub — live but mockup adds year-shape + curves |
| Trip planner — cross-city *when-to-go* swim-lane (distinct from the deck, see ▼ Trip planning) | [trip-planner.md](trip-planner.md) | live at `/planning/calendar` |
| Baseline comparison (vs Allison Park) | [baseline-comparison.md](baseline-comparison.md) | stub — only in mockup |
| Six blocks (curated walk list) | [six-blocks.md](six-blocks.md) | stub — data live, UI pending |
| Deployment (Vercel auto-deploy from `main`) | [deployment.md](deployment.md) | documented |
| Account surface (top-right menu: identity, backup, sign-out) | [account.md](account.md) | live (#82/#83) |
| Family-hub platform integration (#84 epic) | [platform-integration.md](platform-integration.md) | implementation plan — not started |
| Candidate funnel (Board ⇄ Ranking + shared filters + ViewToggle) | [candidate-funnel.md](candidate-funnel.md) | stub — created 2026-06-09 |
| Funnel board (5-stage kanban) | [candidate-funnel.md](candidate-funnel.md) | stub |
| Calibrate (weighted ranking + learned weights) | [candidate-funnel.md](candidate-funnel.md) | stub |
| Visit plan (per-city trip setup, days, checklists) | [visit-plan.md](visit-plan.md) | documented; redesign 2026-06-09 |
| Mobile / responsive (phone parity + a11y) | [mobile.md](mobile.md) | in progress — Phase 0 landed 2026-06-09 |
| Decide questionnaire (post-visit survey) | _todo_ | undocumented |
| Baseline ratings (reference places) | _todo_ | undocumented |
| Image management (hero, search, Supabase Storage) | _todo_ | undocumented |
| Auth (magic link + dev sign-in) | _todo_ | undocumented |

## Trip planning — the deck is canonical

Two separate things share the "trip" name; don't conflate them:

- **Cross-city *when-to-go*** — [trip-planner.md](trip-planner.md), the live
  swim-lane year view (`/planning/calendar`). Picks *which week* to visit
  each candidate. Standalone; not part of the stack below.
- **Per-trip planning flow** — the **Plan · Shelf · Days · Book · Grid**
  experience for a trip you've committed to (sourcing → solve → book). The
  **canonical artifact is the walkthrough deck**
  ([public/mockups/trip-walkthrough.html](../public/mockups/trip-walkthrough.html));
  build against it, not the older standalone mockups. **Now built and live at
  `/trips`** — see [trip-planner-app.md](trip-planner-app.md) (the core flow:
  create → gather → solve → Days/Grid → Book). Engines `lib/solve.js` ·
  `lib/sourcing.js` · `lib/trip.js` are real.

The deck's design stack (specs feeding the canonical mockup):

| Doc | Role | Status |
|---|---|---|
| [trip-planner-app.md](trip-planner-app.md) | **The live /trips feature** — Plan·Days·Book·Shelf·Grid + Solve, on real data | shipped 2026-06-11 |
| [trip-walkthrough-review.md](trip-walkthrough-review.md) | State doc for the 44-slide deck + **Janice's 2026-06-11 review feedback (triaged)** | canonical |
| [trip-planner-ux.md](trip-planner-ux.md) | UX / IA / navigation (the Plan·Shelf·Days·Book·Grid mental model) | spec |
| [trip-planner-components.md](trip-planner-components.md) | Component system; **supersedes** trip-itinerary.md | spec — do not build yet |
| [trip-planner-systems.md](trip-planner-systems.md) | Systems/engine architecture (what *produces* a trip) | spec |
| [trip-planner-critique.md](trip-planner-critique.md) | Design critique work-list | review output |
| [trip-research-synthesis.md](trip-research-synthesis.md) | Research from 5 real trip artifacts; feeds components | research |
| [trip-itinerary.md](trip-itinerary.md) | Original single-format hour-grid | ⚠️ **superseded** by components.md |

When you touch one of these for the first time, the polite move is to write
its feature doc rather than leave the next session to rediscover everything.
