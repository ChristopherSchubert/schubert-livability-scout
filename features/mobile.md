# Mobile / responsive

**Status:** in progress (started 2026-06-09). Goal: near-full mobile parity at
phone width (≈390px). The owner uses a phone in the field for the felt-score
survey, so mobile is a real workflow, not a nice-to-have.

## Scope decision (owner, 2026-06-09)

- **Near-full parity** for reading + working surfaces.
- **In-field felt scoring** (the `/cities/[slug]/assess` survey) is the
  highest-value mobile workflow — and audit found it's already excellent.
- **The heavy drag trip-planner** (`TripPlanner.jsx` timeline) stays a
  **desktop** experience. But status changes must still be possible on a phone
  **without dragging** — the Board's `Planning →` / `← Backlog` advance buttons
  already satisfy this.

## Audit (2026-06-09, live app at 390×844, instrumented)

Driven through the Claude_Preview MCP, logged in via `/api/dev-login`. Findings
were measured (computed contrast ratios, measured tap-target rects, DOM
semantics), not eyeballed.

### Already good ✅
- **Assess / felt-score survey** — one question per screen, answer cards
  284×62–95px (well above the 44px touch floor), progress dots. Needs nothing.
- **Baseline** ("rate from memory") — clean, large buttons.
- **Plan / visit-window** (Charm/Truth + 12-month comfort-crowd chart) — reflows.
- **City-detail hero** — magazine layout holds up on a phone.
- **Board status moves** — `Planning →` / `← Backlog` buttons = non-drag status
  changes already work.
- **Landmarks** — one `<main>`, one `<nav>`, one `<h1>` per page.

### Issues (by severity)

| # | Sev | Surface | Problem |
|---|-----|---------|---------|
| 1 | High | Every page | **Doubled nav chrome overflows.** Funnel tabs clip 2 of 6 stages (Assessed/Baseline run off-edge); on city pages two bars stack to ~190px (~22% of screen) before content. |
| 2 | High | Ranking | **Scores invisible.** Of 9 table columns only 2 (rank #, city) are on-screen; all 6 axis scores scroll off the right edge. The point of the view is invisible on a phone. |
| 3 | High (a11y) | Global | **Contrast fail.** `--muted` was `#7a7268` = 4.39:1 on cream (needs 4.5). Pervasive: tabs, headers, captions, axis labels. **Fixed in Phase 0** → `#6b6358`. |
| 4 | Med | City-detail | ~38px horizontal overflow from hero meta row + one chart SVG. |
| 5 | Med | Board | Sideways-scrolling kanban — usable but shows ~1.2 columns. |
| 6 | Med (a11y) | Global | Touch targets below 44px: stage-tabs 28px, view-toggle 29px, Filters 31px, advance buttons 22px, "hide calibration" checkbox 13×13. |
| 7 | Med (a11y) | Global | Funnel tabs are `<a>` with no `role`/`aria-current`; active stage conveyed by underline only — invisible to screen readers. |
| 8 | Med (a11y) | Ranking | Search input has placeholder but no label; "hide calibration" checkbox has no programmatic label. |
| 9 | Minor (a11y) | Global | City hero/card images all carry `alt=""` (113 images) — informative images marked decorative. |
| 10 | Minor (a11y) | Global | 8 `outline:none` CSS rules — verify `:focus-visible` ring survives on all interactive elements. |

### Design critique — the two surfaces that need design decisions

- **Ranking:** pivot from matrix table → **ranked card list** (reuse the Board
  card). Each city = rank numeral + thumbnail + name + the sort-key/Overall
  score inline & emphasized, with the 5 axis scores as a wrapping row of
  labeled chips. Column-scanning is a desktop affordance; on a phone lead with
  the sort key and put full axis detail one tap deep.
- **Global nav:** **top-scroller, not a bottom tab bar** (owner's call deferred
  to Claude — chose top-scroller to keep the editorial voice and avoid
  all-day chrome on a part-time tool). Make both tab bars horizontally
  scroll-aware with the active item auto-scrolled into view, and **collapse the
  global funnel on city pages** (the back-arrow already provides upward nav) so
  it's one bar, not two.

## Phased plan

- **Phase 0 — Foundation & a11y tokens** ✅ (this commit)
  - Explicit `viewport` export (`app/layout.js`), zoom left enabled.
  - Darken `--muted` `#7a7268` → `#6b6358` (clears AA 4.5:1 on all three paper
    tones: cream 5.48, panel 5.81, deepest 5.07). Fixes #3.
  - Documented canonical breakpoints (640 / 1024 / default) in `globals.css`.
- **Phase 1 — Global nav** ✅ (#1, #7; #6 partial): both tab rows are single-row
  horizontal scrollers at ≤640px with the active tab auto-scrolled into view
  (JS sets `scrollLeft`), an edge-fade mask hinting more, `aria-current="page"`
  on active tabs, 44px touch floor on tabs + backup trigger, and the global
  funnel collapses on city pages (`.sticky-header.has-city`). Files:
  `components/AppShell.jsx`, `app/workspace.css`. Remaining #6 targets (Board
  `.advance` buttons 22px, the calibration checkbox 13×13, Filters 31px) move
  to Phase 4.
- **Phase 2 — Ranking** (#2): card-list at phone width with inline score + chips.
- **Phase 3 — City-detail polish + Board** (#4, #5): kill overflow culprits;
  decide whether Board columns stack on phone.
- **Phase 4 — a11y cleanup** (#8, #9, #10): input labels, meaningful image alt,
  focus-visible verification.
- **Trip planner** (#7 scope): graceful "best on a larger screen" affordance on
  phone instead of a broken drag surface.

## Follow-ups (tracked as GitHub issues)

_None opened yet — phases above are the live worklist. Promote any phase that
slips to an issue and link it here._
