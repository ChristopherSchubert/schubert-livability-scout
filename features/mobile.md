# Mobile / responsive

**Status:** Phases 0–4 shipped 2026-06-09; trip planner assessed (no change
needed). Every audited surface is now usable and horizontal-overflow-free at
phone width (≈390px), and the WCAG findings are closed. Remaining work is
polish, tracked in Follow-ups below. The owner uses a phone in the field for
the felt-score survey, so mobile is a real workflow, not a nice-to-have.

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
- **Phase 2 — Ranking** ✅ (#2): at ≤640px the 9-column table reflows (pure CSS,
  `display` swap + `data-label` chip labels) to self-contained cards — rank +
  thumbnail + name on line 1, then axis/Overall/Visit-now scores as a wrapping
  row of labeled chips with Overall emphasized. All 9 scores now visible (was 2
  of 9); table width 843px → 342px, no overflow. Desktop keeps the sortable
  table. Files: `components/Calibrate.jsx`, `app/workspace.css`.
  **Follow-up:** the column-header sort is `display:none` on mobile, so the only
  mobile sort is the default Overall-desc (which IS the ranking) + the
  search/filters. A mobile sort control (dropdown) is deferred — see follow-ups.
- **Phase 3 — City-detail overflow + Board** ✅ (#4; #5 decided-keep):
  city-detail horizontal overflow gone (24px → 1px sub-pixel). Three fixes at
  ≤640px in `app/city-detail.css`: hero `.meta` chips now wrap (flex-wrap +
  `white-space: normal` on the climate-word span); the climate chart gets
  `overflow-x: clip` so its edge labels can't bleed past the viewport
  (overflow-y stays visible for vertical annotations); the 4-up climate
  "extremes" row drops to a 2×2 grid (each value needs ~98px, a quarter-column
  gave ~49px). Desktop keeps 4-up; verified table/grid intact at 1100px.
  **Board (#5): decided to keep** the horizontal-scroll kanban — it's
  functional on a phone and already has non-drag advance buttons; stacking it
  loses the kanban metaphor for little gain. Revisit only if it tests poorly.
- **Phase 4 — a11y cleanup** ✅ (#6 rest, #8, #10; #9 resolved-as-correct):
  - **Contrast:** faint rank numeral `#c3b59a` (1.87:1) → `#94835f` (3.64:1),
    kept at 24px so it qualifies as WCAG large text. Blue Visit-now header
    `#3a78c2` (4.19:1) → `#3066a8` (5.42:1). `app/workspace.css`, `app/globals.css`.
  - **Touch targets (#6 rest):** Board card advance/back buttons (22px), ranking
    Filters button (31px), search field (36px), calibration toggle → all 44px
    at ≤640px. (Brand wordmark stays an inline text link — WCAG inline exception.)
  - **Labels (#8):** search input got `aria-label="Search city name"`. The
    "Hide calibration" checkbox was already correctly labelled by its wrapping
    `<label>` (my audit's flag was a false positive — it only checked `for`/aria).
  - **Focus (#10):** added a global `:focus-visible` ring (WCAG 2.4.7) as a
    safety net; inputs with their own `:focus` border-accent treatment keep it
    via specificity, so this only fills the gaps on tabs/buttons/clickable rows.
  - **Image alt (#9): resolved as already-correct.** The city hero/card/thumb
    images use `alt=""`, but every one sits adjacent to the city **name as
    text** (`.place` h1, card `<strong>`, rank-table name). Per WCAG, an image
    redundant with adjacent text should have empty alt to avoid double
    announcement — so `alt=""` is conformant here, not a defect. Left as-is.
- **Trip planner** ✅ (assessed — no change needed): the owner scoped the heavy
  drag UI as desktop-primary. On a phone it already degrades gracefully — the
  swim-lane is a self-contained pan/zoom scroller (touch-native "drag to pan ·
  pinch to zoom"), the controls/legend reflow, and crucially the **page itself
  has zero horizontal overflow** (the wide timeline lives inside its own scroll
  container). It is not a broken drag surface, so no "open on desktop" wall was
  added — that would be unwanted chrome on a working screen. Status moves
  without dragging already work via the Board advance buttons (Phase 1 finding).

## Real-device fixes (2026-06-09, from owner iPhone screenshots)

The preview sweep used 390px; the owner's iPhone surfaced two bugs the
synthetic pass missed (both on surfaces not in the original 5-surface audit):

- **Planned-trips cards overlapped (`/planned`, `/visited`).** `.trip-row` is a
  rigid 3-column grid (`140px | 1fr | auto`); at phone width the columns can't
  fit, the city name overflowed its squeezed cell, and the opaque green "Open
  trip plan" button painted on top of the name. Fixed in `app/workspace.css`
  (CSS-only — the JSX lives in the WIP-dirty `VisitWorkspace.jsx`, untouched):
  at ≤640px the card restacks to image+details on row 1, action buttons
  full-width on row 2, and long stay-zone/heart values wrap instead of clipping.
- **City sub-nav hid the active tab.** On a city page the centering effect used
  `offsetLeft` (relative to the offsetParent, not the scroll container), so for
  the first tab it mis-computed and scrolled the row to its end — hiding the
  active **Detail** tab off the left edge. Fixed two ways: the centering helper
  now uses `getBoundingClientRect` deltas (`components/AppShell.jsx`), and the
  city-context strip stacks on mobile so the sub-nav gets its own full-width
  row where all four tabs fit with no scroll at all (`app/workspace.css`).

Re-swept the other un-audited workspace pages (`/visited`, `/assessed`,
`/decided`, `/planning`) — empty states are clean, trip planner functional,
zero horizontal overflow.

## Stats as a swipe carousel (2026-06-09, owner request)

The owner didn't want the city-detail "By the numbers" stats as an endless
scroll (5 axes × ~4 metrics = ~20 stacked rows on a phone). Their idea — swipe
left/right across the axes — is now the mobile treatment:

- `components/city-detail/ChapterData.jsx` is now a client component. Desktop
  still renders all five axes in a CSS grid; at ≤640px the same `.axes` grid
  becomes a horizontal **scroll-snap carousel** — one axis per full-width panel.
- A chip row above the carousel doubles as (a) an at-a-glance overview of all
  five axis scores and (b) the navigator: tap a chip to jump, and the active
  chip + a dot row track the swipe position (scroll handler → `active` state).
- Switcher + dots are `display:none` on desktop; the carousel CSS is all under
  `@media (max-width: 640px)` in `app/city-detail.css`. Verified: swipe updates
  the active chip/dot, tap-to-jump scrolls, desktop grid unchanged at 1200px,
  zero horizontal page overflow.

## Mobile masthead + settings menu (2026-06-09, owner feedback)

- **Lighter brand row.** The "Livability Scout" masthead sits in the
  always-sticky header and was eating ~55px on every scroll. At ≤640px the
  wordmark drops 18px → 15px, the topbar padding tightens, the brand dot
  shrinks, and the ⋯ trigger goes 44px → 40px — brand row now ~46px.
  (The ⋯ at 40px is a deliberate trade against the 44px touch floor for a
  secondary, rarely-used control, to reclaim header space the owner flagged.)
- **Settings dropdown.** The ⋯ menu's "Restore from file" row rendered the
  browser's raw, unstyled `Choose File / No file chosen` control, which broke
  the editorial look. An invisible file input is now overlaid across the row so
  the styled "Restore from file" label is the button (fix applies at all
  widths); menu actions are full-width 44px tap rows on phones.
  `app/workspace.css`.

## Compact city-context bar (2026-06-09, owner feedback)

The city-context strip (back-arrow + "BACKLOG / City Name" + the
Detail/Plan/Images/Assess sub-nav) was eating the always-sticky header — ~107px
because Phase 1 had stacked the name above the sub-nav on two rows. The owner
flagged that static identification shouldn't cost that much. Collapsed it back
to **one short row** (`app/workspace.css`, ≤640px):

- Back-arrow + a truncating city name on the left; sub-nav on the right, all on
  one line. The "BACKLOG" stage eyebrow (pure static text) is dropped on phones.
- Tuned the name max-width + sub-nav font so the full name *and* all four tabs
  fit at 393px ("Santa Cruz, CA" + Detail/Plan/Images/Assess); long names
  truncate with an ellipsis (the hero shows the full name).
- Fixed a latent bug in the sub-nav active-tab centering helper
  (`components/AppShell.jsx`): when the row now fits without overflow it resets
  `scrollLeft` to 0, so a leftover scroll from an earlier (narrower) render no
  longer clips the active first tab.

Result: city-context 107px → **55px**; the city-page sticky header 161px →
**108px** (a third less chrome on every scroll). Desktop keeps the full
two-line context with the stage eyebrow.

## Collapsing brand row + frozen stats menu (2026-06-09, owner request)

Two interlocking scroll behaviors on phones, both driven from `AppShell.jsx`:

- **Brand row hides on scroll-down, returns on scroll-up.** A scroll listener
  toggles `nav-condensed` on `.sticky-header`; the CSS (`app/workspace.css`,
  ≤640px) then hides `.topbar-brand` + the ⋯ menu (and the whole `.topbar-v2`
  on city pages, where it's only the brand row) so just the menu rows stay
  pinned. The city-page sticky header shrinks 108px → 55px while reading.
- **The stats axis menu freezes while in the section.** The Setting/Aliveness/
  Fabric/Realness/Year-round chip row is `position: sticky` (`city-detail.css`)
  pinned at `top: var(--app-header-h)`, so it stays put while you read an axis's
  metrics and releases when you scroll past the stats section. AppShell
  publishes the header's live height as `--app-header-h` (re-measured on
  condense / city change / resize) so the chips pin flush even as the brand
  collapses.

Implementation notes: the scroll handler updates state directly (no rAF) so it
doesn't depend on animation-frame scheduling. The collapse is **animated**
(max-height + opacity, 0.28s eased) rather than a `display:none` snap — the
`overflow:hidden` lives on the brand + the ⋯ trigger (never on `.topbar-v2` or
`.backup-menu`) so it can't clip the absolutely-positioned ⋯ dropdown; the
topbar just eases its padding away. `--app-header-h` is set both on state change
(rest values) and continuously by a ResizeObserver (so the frozen stats chips
track the header smoothly through the collapse animation, not just at the end).
Desktop is unaffected (all the collapse / sticky CSS is ≤640px; the chip
switcher is desktop-`display:none`). Verified rest states + dropdown on a clean
server (the hidden preview tab freezes CSS transitions, so the easing itself is
device-verified, like the scroll trigger).

Follow-up fix: the topbar's top padding + inter-row gap (and the ⋯ wrapper) only
collapsed on city pages, so on list pages (Board etc.) the funnel nav kept ~19px
of dead space above it when condensed. Now the padding/gap close + the ⋯ wrapper
fully collapses on *all* condensed pages, so the menu row rises to the top
(daylight ~19px → ~2px). Board condensed header ≈ 53px (just the nav); city ≈ 56px.

## Simplified mobile planning view (2026-06-09, owner request)

The desktop planning surface is a pan/zoom swim-lane timeline
(`components/TripPlanner.jsx`) — genuinely unusable on a phone (an earlier
"keep it desktop-only" call was wrong). At ≤640px `/planning` now renders a
scannable list instead:

- `components/PlanningView.jsx` picks by viewport (`matchMedia`, mounted-gated
  to avoid SSR mismatch): `TripPlanner` on desktop, `PlanningMobile` on phones —
  so the heavy timeline never mounts on a phone.
- `components/PlanningMobile.jsx` distills the timeline's core question — "which
  candidates should I plan a trip for, and when?" — into cards: **Committed
  trips** (planned, with their date ranges) and **Looking for a slot**
  (planning-stage candidates, ranked by their best upcoming visit window). It
  reuses the *same* `weeklyVisitScore` curve the timeline draws — the best
  window is that curve's peak from today forward (date + a 0–100 quality). Each
  card links to `/cities/[slug]/plan` to lock dates. A third **Backlog** section
  lists candidates not yet in planning, ranked by their best upcoming window —
  the same triage lens the desktop backlog provides (calibration/reference
  places are excluded). The backlog carries a compact **sort** (native
  `<select>`): soonest window, best in spring/summer/fall/winter, or overall
  fit. A season sort both reorders the list *and* re-windows each card to that
  season's best week (e.g. "Best in winter" surfaces warm-winter destinations
  with their Dec/Jan dates) — mirroring the desktop's per-season best-week sort.
- `/planning/calendar` still renders the full timeline (a deliberate
  power-user/desktop destination); the mobile list links to it as "Calendar
  view →".

## Follow-ups (tracked as GitHub issues)

- ~~**Climate-heatmap legibility on phones.**~~ ✅ Fixed 2026-06-09 (from owner
  iPhone screenshots): the temp ramp drops its redundant middle warm anchor
  (Atlanta Jul, marked `secondary`) on phones and shrinks tick labels to 8px so
  the three remaining anchors (Minneapolis / Outdoor ideal / Phoenix) no longer
  collide; the 12-month cell value font drops 14px → 11px so adjacent precip
  numbers stop merging ("0.80.90.1"); and the in-chart Charm/Off-season SVG
  annotations (duplicated in the legend text below) hide on phones to declutter
  the curve. `components/city-detail/ChapterWhen.jsx`, `app/city-detail.css`.
- **Mobile sort control for Ranking.** On a phone the table's tap-to-sort
  column headers are hidden (the table is now cards), so the only sort is the
  default Overall-desc. Add a compact sort dropdown to `.rank-controls` (sort by
  any axis / Overall / Visit-now) so phone users get the full sort surface.
  Code: `components/Calibrate.jsx` (`clickSort`/`sort` state already exist —
  just needs a `<select>` bound to them at mobile width). Low priority; the
  default ranking is the most useful sort. _(promote to a GitHub issue when picked up)_
