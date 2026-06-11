# Livability Scout — Project Guide

A decision tool for finding a US place to live part-time that reproduces the
lived feeling of Bled and Piran, Slovenia: walkable, nature-adjacent, real
public life, alive year-round. It ranks candidate places to **visit**, then
captures the owner's firsthand reaction after each visit. Final judgment
happens on the ground.

## The one rule that overrides everything

**Never invent data.** Every value is either (a) computed from a real, cited
source, or (b) explicitly `null` ("not yet measured"). Hand-entered 0–10
"scores" dressed as measurements are the original sin this project exists to
correct. An honest blank beats a confident guess.

Corollary: do not attribute the model's outputs to the owner's gut. The
owner's judgment enters in exactly one place — the felt-score questionnaire
(Track 2).

**Corollary 2 — zero is not null.** Overpass HTTP 200 with a `remark`
field + empty body was being persisted as "zero of everything" (2026-06-04
incident: Bled / Ljubljana / Piran). `osmMetrics()` in `lib/measure.js`
rejects these now. Every new Overpass-backed measurer must do the same —
real cities have streets; zero of those means the query lied.

**Corollary 3 — no place is "set up to look bad."** Describe and measure
every place by what it honestly is, never as a deliberate bad example. Ban
this framing from code, docs, comments, and prose: "set up to look bad,"
"low/bottom anchor," "calibration floor," "the unwalkable baseline,"
"scores low by design," "the place to leave," "control." Allison Park is
the **owner's home** and the familiar reference each candidate is compared
against — its low walkable-POI count is the honest reading of a residential
pin, not a designed feature and not a verdict on the place. Same rule for
the other reference places (Pittsburgh-area + Slovenia): neutral,
place-first language only. (2026-06-07: the owner pushed back hard on the
"by design / low anchor" framing — do not reintroduce it.)

## ⛔ Overpass: local Docker only, no public fallback

We run our own Overpass at `http://localhost:12345/api/interpreter` with
the planet file loaded. Public mirrors silently return truncated bodies that
look like "this town has zero cafés" (data-quality incidents 2026-06-04,
2026-06-05). Rules:

1. `lib/measure.js#overpass()` defaults to localhost with **no** public
   fallback. If local is down, fail loudly. Restart Docker (`docker ps |
   grep overpass`); don't degrade onto a mirror.
2. Ad-hoc scripts use `OVERPASS_URL=http://localhost:12345/api/interpreter`
   or import `overpass()` from `lib/measure.js`. No raw fetches to
   `overpass-api.de`.
3. Production never measures — measurement is local. "Vercel can't see
   localhost" is not a reason to add a public fallback.

## Supabase is the source of truth

All city/place data lives in Supabase. **No CSVs, no in-source seed maps
keyed by city name, no `const someThingByCity = { … }` literals.** To add a
per-city attribute:

1. Column/table in `supabase/schema.sql` + migration in `supabase/migrations/`.
2. Round-trip through `lib/city-row.js` (`rowToCity`/`cityToRow`) and add
   to `mapPatch` in `lib/db.js`.
3. Runtime reads from the row — never from a literal.

Existing in-source seeds (e.g. `visitClimateSeed`) are debt to migrate, not
a pattern to copy.

## The three data tracks (never blend them)

1. **Measured (objective)** — `cityItem.measuredMetrics`, ~20 metrics under 5
   axes (Setting, Aliveness, Fabric, Realness, January) defined by
   `metricTaxonomy` in `lib/planner-data.js`. Each metric has one canonical
   source. Filled only by the pipeline. Stored as `{ value, asOf }`.
2. **Felt (subjective)** — `cityItem.survey`. Same 5 axes, scored 1–5 against
   fixed anchors, plus a 0–10 **Slovenia score** — the regression target the
   measured metrics aim to predict. Captured via `SurveyFlow` after a visit;
   baselines on the Baseline tab. 5 felt axes ≪ 20 metrics on purpose:
   humans honestly distinguish a handful, not twenty. Machines do the rest.
3. **Visit window** — `visitClimate` (NOAA normals), `crowdSeason`,
   `seasonNotes`. `cityVisitWindow()` computes a **Prime** trip (comfortable
   weather, crowds thinned) and an **Off-season** trip (coldest month — the
   January test made literal). Pass both. (Do **not** reintroduce the old
   "Charm"/"Truth" names for these — the owner dislikes that wording;
   2026-06-09.)

## App architecture (Next.js app router)

- `lib/planner-data.js` — data model + derived helpers; **the godfile**.
  Single source of truth for taxonomy, survey, visit-window logic, city
  factory. Split is the top architecture backlog item.
- `lib/city-detail-view.js` — `buildCityDetailView`: shapes a `cityItem`
  into the magazine-chapter envelope. Backs the live page + `/api/mockup-data`.
- `components/PlannerProvider.jsx` — React context. **Supabase is the system
  of record**: loads cities + per-user surveys/baselines/weights on mount,
  debounce-writes edits back. No localStorage persistence of planner state.
- Routes and components: see [features/README.md](features/README.md).

## Deployment

Vercel auto-deploys from `main`. Production:
https://schubert-livability-scout.vercel.app. Every push to `main` triggers
a build (~1–3 min). **Two secret stores, no overlap**: local measurement
pipeline reads the **macOS Keychain** (account `livability-scout`); Vercel
dashboard holds the runtime env vars. Mirror any new var into both
`.env.local` and Vercel. Full notes + auth/redirect gotchas:
[features/deployment.md](features/deployment.md).

## Commit and push incrementally (overrides the harness default)

The Claude Code default is "never commit unless asked." **Invert it.** When
you finish a logically-distinct piece of work, commit and push before moving
on. Pushing to `main` is how this project ships; an unpushed commit reads as
"didn't happen" the next session. Update the relevant `features/*.md` and
`METRICS_COMPLETION.md` in the **same** commit as the code change.

**The unrelated-WIP gotcha.** This is a long-running solo workspace; the
tree often carries uncommitted changes from prior sessions. **Never `git add
-A` or `git add .`** — stage only the specific paths your work produced (or
`git add -p`). If your change touches a file that also has pre-existing
edits you can't cleanly separate, **stop and ask** how to slice it. A commit
that names a narrow change but contains 30 unrelated diffs makes history
unbisectable. Same rule for destructive changes (schema migrations,
force-pushes, column drops): confirm first.

## Stay-zone boundary + walking-core measurement

A city has a stay zone (polygon in `stay_zone_boundary`) and a measurement
field. The field used to be a 700 m hard disk; as of 2026-06-08 it's a
**plateau-decay walking core**: 500 m solid plateau (full credit) + 400 m
decay constant + 1500 m outer cutoff. POI source is **Google Places** via
the local `pois` cache, not OSM (OSM coverage was too thin). Per-POI
positions + decay weights are cached in `cities.poi_positions` so the chapter
map can render the dots without a runtime API call.

The osm-core measurer (the legacy 700 m hard ring → `cafe_n / bar_n / rest_n /
daily_needs_n`) still runs as a sanity check but no longer drives the
Aliveness composite — those metrics carry `supersededBy` in the taxonomy
and `axisRollup` skips them when the new `_score` metrics are present.

Boundary cascade (Census Place → OSM polygon → Tract → NRHP → point-circle)
and the API auto-refresh live in `lib/measure.js`. Full notes:
[features/walking-core.md](features/walking-core.md),
[features/stay-zone-map.md](features/stay-zone-map.md).

## Standing direction: complete every city's measurements

**Every city should carry a complete, cited measurement set.**
[METRICS_COMPLETION.md](METRICS_COMPLETION.md) is the live coverage table.
When you backfill a metric, update the coverage column in the same commit.
On a new city, run the full pipeline
([features/city-onboarding.md](features/city-onboarding.md)) so it lands
measured, not waiting in queue. When work isn't time-sensitive, moving a
row closer to N/N is the default productive thing.

## Authoring city prose

When you write or edit a city's `why`, read
[features/why-prose.md](features/why-prose.md) first — the 2-paragraph form
(orientation + case/tradeoff) and voice rules are project rules, not
suggestions. Run `scripts/.audit-whys.mjs` after any onboarding batch.

## Feature documentation

Major features each get a markdown file under [features/](features/) (index:
[features/README.md](features/README.md)). **Update the relevant feature
file in the same diff as the code change** — including the follow-ups
section. If you touch a feature without a doc, leave a stub.

## TODOs and follow-ups

When you ship a feature with deferred work, the deferred work goes to a
**GitHub issue**, not an inline checkbox. The feature doc links to the
issue numbers so the explanation that makes the work legible stays
right next to the design that created it. Pattern (see
[features/walking-core.md](features/walking-core.md#follow-ups-tracked-as-github-issues)
for an example):

```
## Follow-ups (tracked as GitHub issues)

- **#42 — One-line title.** A paragraph or two explaining what the
  work is and why it's deferred, with file links to the relevant
  code. The issue itself can be tight; this is where future-you
  rediscovers context.
```

When to use this vs. the project's other TODO surfaces:

- **GitHub issues** — concrete shippable units of work. "Drop the legacy
  `_n` measurers." "Investigate why Piran's score is zero." Things you'd
  realistically do as one commit.
- **`features/*.md` follow-up sections** — list the issue numbers + the
  context. The list IS the issue tracker for that feature; reading it
  refreshes why each item exists.
- **`TODO.md`** — project-level wishlist, cross-feature priorities, ideas
  not yet shaped enough to be issues.
- **`METRICS_COMPLETION.md`** — the metric-coverage ledger with its
  built-in "Remaining gaps" + "Backfill plan" sections. Don't duplicate
  metric backfill work into issues; it lives there.

Labels in use: `data-quality`, `polish`, `follow-up` (created
2026-06-08 alongside the walking-core ship). Plus GitHub defaults
(`bug`, `enhancement`, `documentation`).

## Conventions

- `lib/planner-data.js` is the home for domain logic; components stay thin.
- `normalizeState` fills missing top-level fields only; it never re-seeds
  from JS maps and never overwrites user-entered data (surveys, trips).
- New metric → add to `metricTaxonomy` *with its source*. **Never add a
  metric without a citation.** The Detail page renders it automatically.
- Dev server: `npm run dev` (port 3000). No test suite — verify by driving
  routes (auth-bypass section below).

## Verifying in the preview (auth bypass)

The app is Supabase-auth-gated. To drive the preview, use `/api/dev-login` —
hard-disabled in production, mints a real session from `DEV_LOGIN_EMAIL` /
`DEV_LOGIN_PASSWORD` in `.env.local`. Two ways in:

1. **Form rendered** — `preview_click` on `button.auth-ghost` ("Dev
   sign-in"). AuthGate's `devSignIn()` handles the rest.
2. **Stuck on "Loading…"** — call the endpoint and adopt the session:
   ```js
   const r = await fetch('/api/dev-login', { method: 'POST' });
   const { access_token, refresh_token } = await r.json();
   await window.__supabase?.auth.setSession({ access_token, refresh_token });
   location.reload();
   ```
   Do **not** hand-craft the `sb-<ref>-auth-token` localStorage entry —
   `getSession()` will hang refreshing a session it didn't mint.

`preview_logs` showing `FATAL: Turbopack ... Next.js package not found`
means the dev server is broken (SSR still returns 200; React never
hydrates). Restart the dev server before retrying auth.
