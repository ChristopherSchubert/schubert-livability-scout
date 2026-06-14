# Roadmap — Livability Scout

**Maintained by:** the product-manager / steward role (read/plan; propose-only on
issues — does not edit app code or close the writer's work).
**Last synthesized:** 2026-06-14.

This is the durable backlog synthesis. The live queue is GitHub Issues
(`gh issue list`); this doc is the *why and the sequence* behind it. When the
queue and this doc disagree, the queue is truth — re-synthesize here.

## Current state (2026-06-14)

- **Measurement coverage:** 119/122 places fully measured. The only real gap is
  `median_price_usd` for the 3 Slovenia anchors (Bled / Ljubljana / Piran);
  honest `null` is acceptable per the one rule.
- **Shipping velocity:** high. Trip Planner, Journal, Magazine detail, mobile
  Phase 0, the Google-only auth refactor, and the POI cost gate all landed in
  the ~2 weeks ending 2026-06-13. The QA-audit batch (#62–#78) closed in one
  push on 2026-06-13.
- **Open queue:** small (#68, #75, #79, #82, #83, #84) plus two audit-drift bugs
  filed 2026-06-14 (#85, #86).

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

1. **#85 — Board score tooltip mislabels weight provenance** *(bug, data-quality)*.
   A card claims "equal weights" while showing a learned-weight score once ≥6
   places are surveyed. Wrong output / false provenance is the worst failure
   class for this project. Smallest, highest-leverage fix.
2. **#68 — Reframe cleanup** *(the north star)*. The "vacation app, not a
   decision tool" reframe is still half-spoken in the UI. Inventory issue, ready
   to execute. CLAUDE.md itself still carries the old framing and should be
   reworded in the same pass. (Fold in the #67 residual baseline-copy nits.)
3. **#75 — Repo hygiene** *(scoped)*. Ship the safe parts (dotfile triage,
   `.gitignore` gaps, dead `MapEmbed`/`MapPicker` removal). ⚠️ Do **not**
   blind-move the `public/*.html` mockups — several are live design surfaces
   wired to APIs (`city-detail-redesign.html` ↔ `/api/mockup-data`,
   `trip-walkthrough.html` ↔ `/api/walkthrough-feedback`). Gate, don't delete.
   See the grooming comment on #75.
4. **#82 + #83 — Account menu + settings** *(one UI stream)*. There is currently
   no visible sign-out affordance anywhere. Pair them; design via `design:*`.
   Work against today's Supabase/Google auth — **not** blocked by #84.
5. **#79 — Region/state trip chips + cross-trip filter** *(enhancement)*. The
   deferred richer version of trip grounding; good value, lower urgency.
6. **#86 — E2E teardown guaranteed in CI** *(follow-up)*. Stops slow pollution of
   the shared Supabase from CI runs. Low urgency, real.

**Held pending an owner decision:** #84 (platform / family-hub integration).

## Decisions only the owner can make

These gate sequencing and can't be resolved from code or convention:

1. **January-axis methodology** — the axis exists but the measurement methodology
   is unsettled (TODO.md §4: the 3 current metrics "don't capture what you want").
   A measurement-design call, not code. Until settled, the "January test" stays
   partially defined. *Highest-value blocker.*
2. **Slovenia trio price data** — build an EU price adapter (extend the SURS
   PxWeb path already used for ownership %) to fill `median_price_usd`, or leave
   it honest-`null`? Pure effort-vs-value call; null is acceptable.
3. **#84 platform integration** — is the family-hub contract a now-priority or
   parked? Product-direction call. It consolidates the database + identity into
   the shared `schubert-family` Supabase project (schema-per-app) and is a larger,
   lower-readiness piece.

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
