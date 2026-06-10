# Trip-planner mockups — design critique (2026-06-10)

> Output of a `design-critique` pass over both mockups, viewed live with
> measured computed styles. This is the work-list for the next mockup/UI
> revision. Mockups: [trip-planner-workflow.html](../public/mockups/trip-planner-workflow.html)
> (Gather → Block → Solve) and [trip-planner.html](../public/mockups/trip-planner.html)
> (the finished trip).

## 🔴 Critical

1. **The money shot is missing.** The promise is "press Solve, get Janice's
   grid" — but mockup 2's Solve renders agenda timelines, and the only grid
   (mockup 1) is hand-placed at pixel offsets, predates the engine, and shows
   no machine/human distinction. Nowhere does Block visibly become THE GRID.
2. **Mockup 1's grid quietly lies.** Thu 21 / Fri 22 columns render empty but
   those days hold Piran entries (other leg). Never-fake rule: cross-leg days
   need an "in Piran →" wash or omission.
3. **Signature element is footnote dust.** Measured: citation text 9.92px
   italic, MACHINE tags 9.6px, on textured paper. Set an ~11px functional
   floor or move citations to hover/tap with a readable ✓-verified affix.
4. **Tag semantics leak.** "Hatched + tag = machine row" breaks because anchor
   rows also carry machine-styled tags ("placed in lunch window"). Tags only
   on machine rows; anchor annotations get plain muted text.
5. **Over-packed panel abridges rows silently** while the page claims "every
   value is real engine output." Add "(abridged)" or show all rows.

## 🟡 Moderate

6. Kind is color-only in mockup 2 timelines (4px spine, no text) — violates
   the spec's own "kind always in text" rule; mockup 1's agenda does it right.
7. Block board underpowered for the primary interaction: pool not adjacent;
   no capacity hint at Block time (pre-empt over-packing before Solve); no
   remove affordance; bucket taxonomy drift ("Midday" vs Morning/Afternoon/
   Evening).
8. Emoji as system iconography: unstylable, platform-varying, screen-reader
   noise; ☂️ ambiguous for patio; closed-Mondays chip mixes neutral 📅 with
   warn colors. Custom glyphs long-term; strict icon+text rule now.
9. Null-state copy has two voices ("attributes not fetched — unverified, not
   assumed" vs "unverified") and reads as engineering apologia. One product
   voice: "Not verified yet" (+ future Verify action).
10. Reviewer-facing copy must not ship: "machine · surfaced, not hidden",
    "assembled, not typed" are mockup annotations, not product copy.
11. Distance origin unlabeled ("0.77 km" — from the city pin; users read
    "from my hotel"). Once a stay is booked, origin = the stay, labeled.
12. The two mockups disagree on shared entities: stay-card anatomy differs;
    solved-day = solid dark blocks w/ white text (mockup 1 grid — the only
    dark-fill element in the app) vs light fills + spines (mockup 2). Decide:
    grid adopts light+spine, or its solid look is the one deliberate "print
    artifact" moment.

## 🟢 Minor

- FIXED pill 10.2px, candidate stats 11.8px — bump in the floor pass.
- Hatching may read as "disabled" — test with Janice.
- OVER-PACKED verdict chip wraps badly on mobile.
- Engine-precise minutes ("15:56") look twitchy — round display to :00/:05,
  keep precision underneath.
- The 1→2→3 rail is decoration; real UI needs sticky progress/anchors, and
  neither mockup says where /trips lives in app navigation.

## Accessibility
Palette contrast mostly OK (AA-hardened 2026-06); real failures are the size
floor, kind-by-color-only in timelines, emoji semantics, and tags sitting on
hatched texture (effective-contrast loss).

## What works — keep
- Feasible vs over-packed side-by-side + the flag copy ("instead of silently
  cramming") — the strongest storytelling on either page.
- Provenance made visible: cited dated chips, honest nulls, "est." travel.
- Block board minimalism — "four cards is all the human does" lands instantly.
- Editorial language consistent with the app; mobile stacks clean.

## Priorities
1. **Build the missing climax: Block → THE GRID, generated** — grid rendered
   from real solve.js JSON, machine/human distinction carried into grid cells,
   cross-leg days honest. Resolves #1, #2, #5, #12 at once.
2. **Typography + tag-semantics pass** — 11px floor, tags only on machine
   rows, kind always in text, citations on a readable affordance.
3. **One marker language** — lock icons, one null voice, labeled distance
   origin; freeze as the component spec.

---

## Round 2 — walkthrough action→control audit (2026-06-10, owner-prompted)

Stepped the 20-step script against the pages: **6 of 20 transitions were broken
or unsupported**, including a violation of our own booking-dates-it rule.

Fixed in the deck:
- "She does: …" action line in the context band — every transition names its
  cause (the control used).
- Dates from nowhere → ✎ set-dates control on the window (step 2).
- Balloon contradiction → booked-for-May-19 auto-places itself (step 9); the
  manual-pin demo now uses Rustika (step 10).
- Conservation violation → the Lay-out deal accounts for all 9 items
  (Public & Vegan lands Sunday — closed-Mondays shown working) (step 12).
- 13→14 state mismatch → the solved day now solves exactly the laid-out day.
- Step 16 → the zipline drag is shown (ghost card + tray origin named).
- Captions name the off-stage actions (stay editors for booking; per-city
  candidate strips for Hiša Franko/Brdo).

**Deferred to the real build (controls that don't exist anywhere yet):**
remove-a-city from the window · stay-candidate sourcing/search per city ·
per-city section navigation on the Plan tab · editor doors (✎/click) on
Plan-tab cards and stay bars · global undo · the transport/booking editors
the captions reference.
