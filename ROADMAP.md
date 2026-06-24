# Roadmap — Livability Scout

**Maintained by:** the product-manager / steward role (read/plan; propose-only on
issues — does not edit app code or close the writer's work).
**Last synthesized:** 2026-06-24.

This is the durable backlog synthesis. The live queue is GitHub Issues
(`gh issue list`); this doc is the *why and the sequence* behind it. When the
queue and this doc disagree, the queue is truth — re-synthesize here.

## Current state (2026-06-24)

- **Family-hub integration (#84) DONE.** Prod `travel.schubertfamily.com` runs
  on the shared `schubert-family.travel` schema; identity via platform
  `current_member_id()`; feed conformance green in production (`check-feed.mjs`
  CONFORMANT). All 7 spine tickets closed (#88–#94). `schubert-travel` left
  untouched as rollback; retirement is owner-only and deferred.
- **Measurement coverage:** unchanged from prior sync — 119/122 fully measured;
  remaining gap is `median_price_usd` for the 3 Slovenia anchors (honest `null`
  is acceptable per the one rule).
- **Open queue:** **very small** — just #95 (family-hub palette, deferred
  post-cutover) and #101 (cross-domain SSO cookie follow-up; commit already
  landed, awaiting verification close). No bugs, no audit drift outstanding.

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

> **#84 family-hub integration: DONE (2026-06-22).** Prod cutover live, feed
> conformance green, all 7 spine tickets closed. The "top priority" slot is
> now open — see "What's next" below.

### Recently shipped — verified in commits (2026-06-14 → 24)
✅ **#84 family-hub integration epic CLOSED** — #88 env/boot validator (`c8a4283`)
· #89 schema port + data migration (`521cc46`/`9179595`) · #90 identity/RLS via
`current_member_id()` (`611ed67`) · #91 app/auth/realtime re-point + member.id-as-userId
fix (`ad4c7c3`/`599a2c5`) · #92 measurement pipeline → schubert-family (`bbfebf3`) ·
#93 GET /api/feed + HS256 + conformance green in prod · #94 cutover verified.
Plus: #98 dead from-leg chip (`1a1fb40`), #100 board/visited/assessed reframe voice
(`540be41`), #75 mockup retirement (`dcb5873`/`e40cd6e`), and the prior batch
(#85/#86/#82/#79/#96/#97).

### Open queue
1. **#101 — Cross-domain SSO cookie.** Commit `a12d0f0` already landed
   (`NEXT_PUBLIC_COOKIE_DOMAIN`-driven `cookieOptions.domain`); only the live
   "signed-in on hub, opening travel skips re-login" verification remains.
2. **#95 — Family-hub colour system** *(FYI / optional alignment)*. Deferred
   post-cutover; revisit when there's appetite for the visual continuity pass.

### What's next (steward synthesis)
With #84 done, the natural next focuses, ranked by leverage:
- **Verify #101 SSO** and close it — small, finishes the cutover tail.
- **Resume the measurement-coverage work** that was paused for #84 (the
  3 Slovenia-anchor `median_price_usd` gap; the January-axis methodology
  question — see "Decisions only the owner can make" below).
- **Continue the reframe consistency** — #68 closed, but a watch for residual
  decision-tool/verdict language as new surfaces ship is worth a periodic sweep.
- **The Janice/walkthrough-deck follow-ups** absorbed into the codebase
  (deck retired; route `/api/walkthrough-feedback` is a cleanup candidate per
  the archive README — small follow-up issue welcome if it bothers anyone).
No epic is queued; this is genuinely a clear runway moment.

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
