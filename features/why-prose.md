# Why prose (why / if-wins / if-fails)

Three short prose fields on every city — the case for the place, plus
the gut gates that decide whether a visit confirmed or refuted it.
The "why" is the editorial pitch; "if wins" and "if fails" are the
sentences you write *before* the trip so post-trip rationalization
doesn't move the goalposts.

## How it works today

- **Data**: `cities.why`, `cities.if_wins`, `cities.if_fails` (text).
  Hand-written per city; not derived from any source.
- **Render (live)**: shown on the city detail page above the metrics —
  `cityItem.why` paragraphs, then a callout with "If it wins" and
  "If it fails". Live in
  [components/PlannerShell.jsx](../components/PlannerShell.jsx) (`CityDetail`).
- **Render (mockup)**: chapter 2 of
  [public/city-detail-redesign.html](../public/city-detail-redesign.html) — same content,
  magazine typography (drop cap, wider measure).
- **Authoring rule**: 2-paragraph form, geography/fabric → case + honest
  tradeoff + "you'd be testing…" closer. Set during the 2026-06-03 audit
  (TODO #5).

## Status

- All 78 candidate cities have whys in the 800–1600 character band (the
  audit's target).
- The 9 calibration/benchmark places (Pittsburgh-area controls + Slovenia
  originals) keep their short whys — intentional, not a gap.
- `if_wins` / `if_fails` are populated unevenly — present on the cities
  that have made it past Shortlist; absent on early candidates.

## TODOs / future direction

- **Reading-quality typography for the live route.** Mockup uses a drop
  cap, a wider measure, and small caps on "If it wins" — none of which
  the live page does. Worth lifting when the magazine wire-up lands
  (see [magazine-detail.md](magazine-detail.md)).
- **`if_wins` / `if_fails` prompt on stage change.** When the owner moves
  a city to Shortlist, surface a small modal that asks for these two
  sentences if they're blank — easier than a separate authoring pass
  and prevents trips that don't have a gate to fail.
- **Versioning.** Every why edit overwrites the prior version. If the
  owner reframes a place mid-evaluation, the old framing is lost. A
  simple `why_history` jsonb append-only column would keep the audit
  trail.
- **No source rule still applies.** Why is editorial, not measured —
  belongs in `cities` as user content, not in `measured_metrics`. Watch
  for drift if anyone tries to "derive" a why from metrics.
