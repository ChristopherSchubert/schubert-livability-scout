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

> **Top priority (owner directive, 2026-06-14):** the **#84 family-hub platform
> integration** epic is now #1 — it gets knocked out before any other in-flight
> work. Plan: [features/platform-integration.md](features/platform-integration.md);
> children #88–#94; dependency DAG + platform interlocks on #84. It's an auth +
> production-DB migration, gated on owner sign-off and platform-side deliverables.
> **Phasing decided** (platform steward, 2026-06-14): **(A) all-in-one now** — plan
> #88–#94 accepted as written; interlocks tracked as platform `schubert-family#19`.
> **#88 (env validator) ✅ shipped + closed** (`c8a4283`, 2026-06-21) — `lib/env.js`
> boot-validates required env via `instrumentation.js`; anon-key fallback dropped.
> `NEXT_PUBLIC_HUB_URL` = `https://schubertfamily.com` (apex; set in Vercel + `.env.local`).
> The `travel` schema is **created + exposed** (verified 2026-06-21 via PGRST205), so **#89
> is next** — gated only on a **seated writer + the `schubert-family` DB password (Keychain)
> + owner go to apply migrations to the shared DB**. ✅ Auth+DB go **confirmed by the owner**
> (2026-06-14), absolute condition: **never delete `schubert-travel`** (copy-only; rollback).
> Critical path: ~~#88~~ → **#89** → #90 → {#91, #93} → #94 (#92 parallel after #89).
> Details + next-writer checklist in the [[project_family_hub_integration]] memory.

### Recently shipped — verified in commits (2026-06-14 → 21)
✅ **#88 env/config + zod boot validator (`c8a4283`) — first #84 child shipped** ·
#85 tooltip provenance (`bc0d4f7`) · #86 E2E teardown (`76fd65a`) · #82 account menu
(`81192e1`) · #79 region/state trip chips (`990cff3`/`2cf9d5a`/`d3498e2`) · #97
`/api/mockup-data` 500 (`db1fd3e` — was a Keychain-pg client that can't run on Vercel;
moved to the service role) · #96 prod-login incident (dashboard: Google client secret +
Site URL on `schubert-travel`; verified clean Google logins for both users 2026-06-21).

### Open queue (all *after* the #84 epic)
1. **#68 — Reframe cleanup** *(north star)*. Residual decision-tool/verdict language.
   The 2026-06-13 repo-wide purge (`7cc682b`) didn't get everything; #68 is the inventory
   of what remains. CLAUDE.md still carries old framing **and the stale prod URL**
   (`schubert-livability-scout.vercel.app` → should be `travel.schubertfamily.com`) — fix
   in the same pass. (Fold in the #67 residual baseline-copy nit.)
2. **#75 — Repo hygiene** *(scoped)*. Safe parts (dotfile triage, `.gitignore` gaps, dead
   `MapEmbed`/`MapPicker`). ⚠️ Do **not** blind-move the live `public/*.html` mockups
   (wired to APIs). See the grooming comment on #75.
3. **#83 — Account settings surface**. The menu (#82) shipped; this is the panel it opens.
   Design via `design:*`.
4. **#95 — Family-hub colour system** *(FYI / optional alignment)*.

## Decisions only the owner can make

These gate sequencing and can't be resolved from code or convention:

1. **January-axis methodology** — the axis exists but the measurement methodology
   is unsettled (TODO.md §4: the 3 current metrics "don't capture what you want").
   A measurement-design call, not code. Until settled, the "January test" stays
   partially defined. *Highest-value blocker.*
2. **Slovenia trio price data** — build an EU price adapter (extend the SURS
   PxWeb path already used for ownership %) to fill `median_price_usd`, or leave
   it honest-`null`? Pure effort-vs-value call; null is acceptable.
3. **#84 platform integration** — ✅ resolved 2026-06-14: now-priority (top of
   queue). Contract questions answered by the platform steward; implementation
   plan + children #88–#94 filed. Remaining owner gates: explicit sign-off on the
   auth handoff + DB migration before any code; `schubert-travel` retirement stays
   owner-only and deferred.

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
