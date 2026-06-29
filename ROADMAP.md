# Roadmap — Livability Scout

**Maintained by:** the product-manager / steward role (read/plan; propose-only on
issues — does not edit app code or close the writer's work).
**Last synthesized:** 2026-06-28.

This is the durable backlog synthesis. The live queue is GitHub Issues
(`gh issue list`); this doc is the *why and the sequence* behind it. When the
queue and this doc disagree, the queue is truth — re-synthesize here.

## Current state (2026-06-27)

- **Family-hub integration (#84) DONE.** Prod `travel.schubertfamily.com` runs
  on the shared `schubert-family.travel` schema; identity via platform
  `current_member_id()`; feed conformance green; cross-domain SSO live across
  hub + travel + finance. All spine tickets closed (#88–#94 + #101).
  `schubert-travel` left untouched as rollback; retirement is owner-only and
  deferred.
- **Family-hub palette adopted (#95).** Full light + dark token set wired in
  `app/globals.css`; three-state user theme toggle (Auto/Light/Dark) in the
  account menu with cookie-based first-paint. Travel'\''s legacy `--bg/--panel/
  --text` aliased to the canonical hub names so 1500+ component `var()` sites
  needed no sweep.
- **Off-season axis dropped from vacation scoring (#105).** "January test"
  phrase retired; the axis (renamed Year-round → Off-season) is
  `excludeFromScoring: true`. Underlying metrics stay visible on the city
  detail page; the vacation Fit composite now rolls 4 axes (Setting / Aliveness
  / Fabric / Realness). A future livability-decision mode would re-weight it.
- **Measurement coverage:** 119/122 fully measured; remaining gap is
  `median_price_usd` for the 3 Slovenia anchors. Owner accepted honest `null`
  as final (#104) — not a gap to chase.
- **Trip Composer epic — P1+P2+P3 SHIPPED 2026-06-29 (#107/#108/#109).**
  Reconciled the three overlapping planning surfaces (per-city Plan tab, the
  `/planning/calendar` swim-lane, and `/trips`) into one model: **city = fact
  sheet · swim-lane = trip composer (WHEN) · `/trips` = detailed planner (HOW)**.
  Per-city Plan tab removed (#107); swim-lane Commit now creates a trip and
  "Planned" derives from trip membership, fixing the cardinality bug (#108);
  adjacent stays merge into one multi-leg trip, plus the `archived_at`
  archive-guard / deletion-cascade integrity invariants (#109). Design +
  rationale in [features/trip-composer.md](features/trip-composer.md); shaped via
  a 4-persona design panel. PM acceptance audit (2026-06-29): P1/P2 clean; P3
  complete with two documented deferrals — the **drag-off gesture** (operation
  ships via the ↩ button; gesture → **#111**) and the **stage-advance guard**
  (intentionally deferred per spec). **Open:** **#110** (want-list / Place·Leg
  recast / column-drop + the pre-#108 legacy-bridge backfill — load-bearing, not
  optional), **#111** (drag-off gesture polish).

### City counts — the 78 vs 122 reconciliation

Both numbers are correct; they count different cohorts:

- **78 = candidate destinations** — the US-focused places the owner is evaluating
  for trips. This is the number in `TODO.md` (dated 2026-06-03, now stale) and
  the hero-image notes.
- **122 = all measured places** — the 78 candidates + 3 Slovenia anchors +
  ~41 later additions (lake-and-mountain candidates and neighborhood entries like
  SoHo / Noe Valley). This is the live ground truth in `METRICS_COMPLETION.md`
  (reconciled 2026-06-08, commit `ce7adf1`; re-confirmed via
  `scripts/.list-cities.mjs` on 2026-06-14).

`METRICS_COMPLETION.md` is the canonical count. `TODO.md`'s "78" is a dated
session log, not a live figure.

## Recommended sequence (by leverage)

Ranked value × applicability × readiness ÷ effort, bugs first.

> **#84 family-hub integration: DONE (2026-06-22) — cutover live, feed
> conformance green, cross-domain SSO live, palette adopted (#95).**

### Recently shipped — verified in commits (2026-06-14 → 27)
✅ **#84 family-hub integration epic CLOSED** — #88 env/boot validator (`c8a4283`)
· #89 schema + data (`521cc46`/`9179595`) · #90 identity/RLS via `current_member_id()`
(`611ed67`) · #91 app/auth/realtime re-point + member.id-as-userId fix
(`ad4c7c3`/`599a2c5`) · #92 pipeline → schubert-family (`bbfebf3`) · #93 `/api/feed` +
HS256 + conformance green in prod · #94 cutover verified · #101 cross-domain SSO
cookie (`a12d0f0`, verified end-to-end on schubert-family#51) · #95 full palette
adoption + theme toggle (`1bb3c3d`).
Plus: #98 dead from-leg chip (`1a1fb40`), #100 board reframe voice (`540be41`),
#103 dead `/api/walkthrough-feedback` route removed (`ad65636`), #105 off-season
axis dropped from vacation scoring (`8f59e5b`), and the prior batch
(#75 mockup retirement / #85 / #86 / #82 / #79 / #96 / #97).

### Open queue
**Trip Composer epic — P1/P2/P3 shipped (#107/#108/#109, 2026-06-29).** Remaining:
- **#112** — pre-#108 legacy-bridge backfill: migrate `status='Scheduled'` cities
  onto real trips + remove the dual "Planned" path in `cityStage()`. *Highest
  leverage* (collapses two sources of truth into one). Split out of #110.
- **#111** — drag-off gesture + live merge-during-drag polish (the operation
  already ships via the ↩ button; this is the deferred drag affordance).
- **#110** — remaining deferred bucket: want-list, full Place/Leg recast, drop the
  inert city-row trip columns, dedicated split UI. Not-now by design.

### What's next
Sequence: **#112** first (removes the legacy "Planned" bridge while context is
fresh) → **#111** UX polish → revisit **#110** once the model has miles on it.
Horizon items the owner has flagged as not-now:
- A future **livability-decision mode** (separate from this vacation app)
  would re-weight the off-season axis and re-introduce the Slovenia price
  question. Not in scope here.
- **Type-stack alignment with the hub** (Source Serif 4 / Hanken Grotesk vs.
  Travel'\''s Fraunces / Inter Tight) — open question on schubert-family#55,
  hub PM hasn'\''t replied, not blocking.

## Decisions only the owner can make

These gate sequencing and can't be resolved from code or convention:

1. **January-axis methodology** — the axis exists but the measurement methodology
   is unsettled (TODO.md §4: the 3 current metrics "don't capture what you want").
   A measurement-design call, not code. Until settled, the "January test" stays
   partially defined. *Highest-value blocker.*
2. **Slovenia trio price data** — build an EU price adapter (extend the SURS
   PxWeb path already used for ownership %) to fill `median_price_usd`, or leave
   it honest-`null`? Pure effort-vs-value call; null is acceptable.
3. **#84 platform integration** — ✅ **DONE 2026-06-22.** Prod is live on
   `schubert-family.travel`; feed conformance green. Open owner item:
   **`schubert-travel` retirement** — stays owner-only and deferred per the
   contract; no Claude action.

## Acceptance audit — 2026-06-14

Sampled the correctness/data-integrity-sensitive closes from the #62–#78 batch
against current source.

| Issue | Verdict | Outcome |
|---|---|---|
| #70 Gut-score label | ✅ Verified | `DecideWorkspace.jsx:69` now "Gut {n}/10". |
| #71 Survey re-run status drift + Winter Revisit UI | ✅ Verified | `VisitReview.jsx` guards status; verdict picker present. |
| #73 Perf (hero LCP, filter memo, dead manifest read) | ✅ Verified | All three fixed. |
| #78 Score transparency / dead controls | ⚠️ Partial → **#85** | "Restore from file" removed, Water-grandeur cap fixed, weights unified — but the Board tooltip still hardcodes "equal weights." |
| #74 E2E trip teardown | ⚠️ Partial → **#86** | Works locally; conditional skip leaves CI exposed. |
| #67 Banned framing (Allison Park) | ⚠️ Borderline → comment on #67 | Literal banned phrases gone; "anchor the high end" baseline copy is borderline against Corollary 3. Flagged for the #68 wording pass. |

Net: the batch held up well — three clean, two genuine drifts now tracked
(#85/#86), one borderline wording note.
