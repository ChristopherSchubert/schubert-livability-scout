# Architecture review

A standing assessment of where the codebase is and the sequenced path to
excellent architecture + code quality. Update the "Done" section as items land;
re-prioritise the backlog as the shape changes.

## Guiding constraints (don't regress these)

- **Supabase is the system of record.** No CSVs, no in-source `{ "City, ST": … }`
  seed maps feeding runtime values. (See CLAUDE.md.)
- **Never invent data.** Every displayed number is computed from a cited source
  or shown as an honest blank.
- **Domain logic in `lib/`, components stay thin.**

## Current state (snapshot, 2026-06-27)

Largest modules, by lines:

| File | Lines | Assessment |
|---|---|---|
| `lib/measure.js` | ~2066 | Large but cohesive (the measurement routine). Deliberately isomorphic — imported by Node `.mjs` scripts AND the API route, so it must NOT take a `server-only` guard. |
| `lib/image-manifest.js` | ~637 | Image search/save cascade. Self-contained. |
| `components/PlannerShell.jsx` | ~573 | `VisitPlan` + `ImagesPage` + their helpers. Mildly grown since the last snapshot; still a candidate for the P2 split below. |
| `components/PlannerProvider.jsx` | ~341 | Healthy. Supabase-first context. |
| `lib/planner-data.js` | 12 | **Thin barrel.** The former godfile is split (#47 closed). Re-exports the focused modules below so existing `from "lib/planner-data"` imports keep working. |

What's healthy: the measurer registry (`lib/measurers/*`, one file per source),
the Supabase-first provider, the `lib/city-detail-view.js` shared shaper, the
magazine chapter components (each < 230 lines), and the post-split domain
modules — `lib/metrics.js`, `lib/survey.js`, `lib/visit-window.js`,
`lib/stages.js`, `lib/image-queries.js`, `lib/city-factory.js`.

Platform integration: **done.** Prod runs on `schubert-family.travel` with
identity through `platform.member`; feed conformance green. See
[features/platform-integration.md](features/platform-integration.md) for
the implementation history.

## Done this session

- **Removed the legacy hand-scored `matrix` system end-to-end** — the "score
  dressed as a measurement" that violated the prime rule. Dropped from
  `planner-data.js`, two components, the provider, `city-row.js`, `db.js`,
  schema; migration `0003_drop_matrix_column.sql`. Everything now scores via
  `weightedAxisScore` over cited `measured_metrics`.
- **Extracted `lib/city-detail-view.js`** so the `/api/mockup-data` route and
  the live React detail page share one envelope shaper (no drift).
- **Wired the magazine detail layout** into `/cities/[slug]`; deleted the
  orphaned `CityDetail` + its dead helpers from `PlannerShell.jsx` (912 → 532).
- **Aligned the dashboard palette + typography** with the editorial detail page.
- **Fixed CLAUDE.md** (it claimed localStorage persistence; it's Supabase-first.
  Added the redirect routes, the shared shaper, and the magazine route.)

## Backlog (prioritised)

### ✅ Done since the prior snapshot

- **P1 (godfile split):** done. `lib/planner-data.js` is a 12-line barrel;
  domain code lives in `metrics.js` / `survey.js` / `visit-window.js` /
  `stages.js` / `image-queries.js` / `city-factory.js`. (#47 closed.)
- **P5 (tests):** the "there are none" claim is dead. 29 test files (147
  pure-logic tests in `test/*.test.mjs` + 35 component tests in
  `test/components/*.test.jsx` via Vitest + Testing Library + a Playwright
  critical-path E2E in `e2e/`). Pre-commit + CI gate on `npm test`.

### P1 — Purge the remaining in-source seed maps
After the godfile split, `visitClimateSeed` (in `lib/city-factory.js`) and
`CITY_IMAGE_QUERY_OVERRIDES` (in `lib/image-queries.js`) are still in-source
city-keyed literals. CLAUDE.md flags these as debt. Move them onto Supabase
columns/tables; backfill in a one-off migration; delete the maps. Add a CI lint
that fails on `"[A-Z][a-z]+, [A-Z]{2}":` literals under `lib/`. `starterCities`
can stay as the empty-DB bootstrap fallback, or move to a seed SQL file.
Risk: medium (needs a backfill run against the DB).

### P2 — Split `components/PlannerShell.jsx`
Move `VisitPlan` → `components/city-visit/VisitPlan.jsx`, `ImagesPage` →
`components/city-images/ImagesPage.jsx`, shared atoms (`Field`, `defaultSearch`,
`moveItem`, `PasteByUrlPanel`) into colocated files. Then `PlannerShell.jsx`
disappears. Risk: low (only two route wrappers import it).

### P3 — Type the data shape (incremental TS in `lib/`)
Convert `lib/` to TypeScript starting with the domain modules; check in
`supabase gen types`. Components stay JSX initially. Locks `cityItem.*` access
against one definition — the precondition that makes every later refactor safe.
Risk: low-medium; do it module-by-module.

### P4 — Surface candidate cores on the detail map
`findVisitCenters` (in `lib/measure.js`) runs server-side and isn't in the
envelope, so the magazine Where-map shows boundary + pin + field but not the
ranked-core picker from the mockup. Add a `visit_cores jsonb` column (refreshed
by `/api/measure`) or a client compute, then restore the candidate list +
click-to-reselect.

## Explicitly out of scope (don't do these now)

- No UI framework (shadcn/Radix) — the editorial style is bespoke and a
  component library would fight it.
- No state-management library — Context + Supabase is right for this scale.
- No `server-only` on `lib/measure.js` — it's intentionally isomorphic and
  reused by Node scripts; the guard would break them.
- No CMS — `why` belongs in a Supabase column, edited in the app.
