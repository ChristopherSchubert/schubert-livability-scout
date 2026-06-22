# Places overview — Board ⇄ Compare

Two lenses on the **same** set of places, switched by a shared toggle:

- **Board** (`/board`, [`FunnelBoard.jsx`](../components/FunnelBoard.jsx)) — a
  5-stage kanban (Backlog → Planning → Planned → Visited → Assessed). Drag a
  card between Backlog and Planning to move it; the later stages need data
  entered on their own pages, so the Board offers no advance button for them.
  - **Header alignment (2026-06-09 fix).** Each column header carries help
    text that runs 2–3 lines depending on the stage, which used to push the
    shorter columns' first card higher than the rest. `.funnel-column-head p`
    in [`workspace.css`](../app/workspace.css) now reserves 3 lines
    (`min-height` + `-webkit-line-clamp: 3`) so every filled column's header
    is the same height and the first cards line up.
  - **Score badge provenance (#85).** Each card shows the city's Overall
    measured score; its tooltip names the *actual* weighting in effect —
    "equal weights" below the learned threshold, "learned weights" once ≥6
    places are surveyed. It used to hardcode "equal weights" and silently
    mislabel learned-weight scores. The card lives in
    [`FunnelCard.jsx`](../components/FunnelCard.jsx), extracted from the board so
    it renders and is tested in isolation
    ([`test/components/FunnelCard.test.jsx`](../test/components/FunnelCard.test.jsx)).
  - **Drag is desktop-only convenience; the buttons are the real mechanism
    (#59/#60).** Native HTML5 DnD doesn't fire on touch, and only Backlog and
    Planning are valid drop targets anyway (the later stages are data-gated).
    So every move is reachable *without* drag: the free Backlog⇄Planning moves
    via each card's `← Backlog` / `Planning →` footer buttons, the gated moves
    via the city's own page. `canDrop(stageId)` gates the highlight — a
    data-gated column no longer lights green then silently rejects the drop —
    and `onDragEnd` clears a stuck highlight after an Esc/cancel. The "drag or"
    fragment of the move hint is hidden on coarse pointers
    (`@media (hover: none)`), and an empty gated column reads "Set from a
    city's page" instead of a false "Drop a card here".
- **Compare** (`/ranking`, [`Calibrate.jsx`](../components/Calibrate.jsx)) — a
  sortable table of the same places, organized around **when** each one is good
  to visit (#68). A **"Best to visit in [month]"** selector (`filters.nowMonth`
  / `setNowMonth`) drives the primary **"Great in [month]"** column
  (`visitNowScore` — that month's climate comfort plus a don't-miss-it nudge
  when the next two months drop) and a compact 12-month **year sparkline**
  ([`YearSparkline.jsx`](../components/YearSparkline.jsx); tested in
  [`test/components/YearSparkline.test.jsx`](../test/components/YearSparkline.test.jsx))
  showing each place's year-shape with the selected month solid and the Prime
  window outlined. The five per-axis columns and the **Fit** column (a weighted
  average; weights **learned** from the owner's gut via `learnedAxisWeights`)
  stay as honest, sortable signals — Fit is de-emphasized (one signal, not a
  verdict), and the old `#` rank ordinal is gone. Default sort is by the
  timing column; click any header to re-sort, shift-click adds a secondary
  sort. The route stays `/ranking` (no broken links); only the label/voice
  changed. On a phone the table reflows to cards (place → sparkline → great-in
  → axes → Fit); see [mobile.md](mobile.md).

## Shared filter system

Both pages filter the same `cityItem`s through
[`components/city-filters.jsx`](../components/city-filters.jsx): a `Filters`
button (with active-count), a slide-in drawer (region / state / chip
vocabulary / per-axis minimum sliders / visit-now minimum), an active-filter
chip strip, and a search box. **The Planning backlog reuses this same system**
— see [trip-planner.md](trip-planner.md). Don't build per-screen filter UI;
extend this module. A shared `SortControl` dropdown also lives here (used by
the backlog; Board/Ranking don't need it since they sort by stage / column
header).

## Shared header ([`components/FunnelHeader.jsx`](../components/FunnelHeader.jsx))

Both views render an **identical** compact header (eyebrow "Places" + h1
"Every place" + a one-line `meta`). This exists because Board used to
carry a tall editorial header while Compare had none, so switching views
jumped the ViewToggle and all content ~124px vertically (2026-06-09: the owner
flagged that toggling "moves"). With the same header on both, the controls bar
+ toggle sit at the same Y on each page → no shift. The title was also
shrunk (`.funnel-header h1` scoped override in
[`workspace.css`](../app/workspace.css)) since it ate a lot of space. The
disabled "+ Add candidate" button was dropped (it was paused/non-functional).
Keep the `meta` to one line on both views so the header heights stay equal.

## View toggle ([`components/ViewToggle.jsx`](../components/ViewToggle.jsx))

The Board/Compare switch. Originally two bare words that didn't read as
interactive (2026-06-09: the owner couldn't tell it was a toggle). Now a
single shared component: a "VIEW" eyebrow label, a segmented pill, an icon per
segment (kanban columns for Board, a calendar for Compare — the view is
organized by when a place is good), the active segment raised (white + shadow +
accent icon), and a hover/focus lift on the inactive one so it clearly reads as
a clickable alternate view. Styles in
[`app/workspace.css`](../app/workspace.css) (`.view-toggle*`). Extracted so the
two pages can't drift; pass `active="board"` / `active="ranking"` (the id/route
stay `ranking`, the label reads "Compare").

## Voice: vacation app, not a decision tool (#68)

The product reframed (2026-06-09) from "rank → decide → verdict" to "find &
enjoy destinations." The funnel surfaces speak the kept **"would you go
back?"** question, never a verdict. The post-visit outcome is stored under
the historical `decision` field + values (`Advance` / `Winter Revisit` /
`Eliminate`) — they round-trip through Supabase, so the data layer keeps them
— but every display goes through `revisitLabel()` in
[`lib/stages.js`](../lib/stages.js) → **Going back / Winter revisit / Not
going back** — one home so the Board chip, the `/assessed` archive filters,
and the `VisitReview` capture flow can't drift. The `/assessed` page is the
`LookingBackArchive` ("Looking back"), not a "portfolio of decisions."
`chipClass()` still keys the CSS color off the stored value, so the helper is
display-only. (2026-06-13: the relocation/decision identifiers `Decide`,
`DecideRoute`, `DecidedArchive`, `DECISION_VALUES`, and `decisionLabel` were
renamed to `VisitReview`, `VisitReviewRoute`, `LookingBackArchive`,
`REVISIT_OUTCOMES`, and `revisitLabel`. The stored `decision` field and
`decision-chip` CSS class stay — renaming them needs a migration.)

Resolved (2026-06-21, #68): the owner's call on the **Ranking spreadsheet +
per-axis "minimum scores" sliders** — *"integrate timing/seasonality, and
reframe a bit. But this is such good data."* So the data was kept, not removed,
and the leaderboard framing was softened into the **Compare** view above:
timing promoted to first-class (month selector + "Great in [month]" + year
sparkline), Fit de-emphasized as one signal, the `#` rank ordinal dropped, and
the label/voice moved from "Ranking" to "Compare." The "minimum scores" filter
sliders stay — they're a discovery filter, not a verdict. (2026-06-13:
CLAUDE.md's header was rewritten to the vacation/exploration framing.)

## Status

Stub — created 2026-06-09 alongside the ViewToggle redesign. The kanban,
ranking table, and learned weights predate this doc and aren't fully written
up here yet.
