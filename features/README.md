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
| Visit window (Charm + Truth months) | [visit-window.md](visit-window.md) | stub — live but mockup adds year-shape + curves |
| Trip calendar (drag-to-schedule wall-planner) | [trip-calendar.md](trip-calendar.md) | live at `/visit/calendar` |
| Trip planner (swim-lane year view + design study) | [trip-planner.md](trip-planner.md) | live at `/visit/calendar` |
| Baseline comparison (vs Allison Park) | [baseline-comparison.md](baseline-comparison.md) | stub — only in mockup |
| Six blocks (curated walk list) | [six-blocks.md](six-blocks.md) | stub — data live, UI pending |
| Deployment (Vercel auto-deploy from `main`) | [deployment.md](deployment.md) | documented |
| Candidate funnel (Board ⇄ Ranking + shared filters + ViewToggle) | [candidate-funnel.md](candidate-funnel.md) | stub — created 2026-06-09 |
| Funnel board (5-stage kanban) | [candidate-funnel.md](candidate-funnel.md) | stub |
| Calibrate (weighted ranking + learned weights) | [candidate-funnel.md](candidate-funnel.md) | stub |
| Visit plan (logistics, days, checklists) | _todo_ | undocumented |
| Decide questionnaire (post-visit survey) | _todo_ | undocumented |
| Baseline ratings (reference places) | _todo_ | undocumented |
| Image management (hero, search, Supabase Storage) | _todo_ | undocumented |
| Auth (magic link + dev sign-in) | _todo_ | undocumented |

When you touch one of these for the first time, the polite move is to write
its feature doc rather than leave the next session to rediscover everything.
