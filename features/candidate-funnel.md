# Candidate funnel — Board ⇄ Ranking

Two lenses on the **same** candidate set, switched by a shared toggle:

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
- **Ranking** (`/ranking`, [`Calibrate.jsx`](../components/Calibrate.jsx)) — a
  sortable table of the same cities with per-axis columns, an Overall column
  (weights **learned** from the owner's gut via `learnedAxisWeights`), and a
  Visit-now column. Click a column header to sort; shift-click adds a
  secondary sort.

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

Both views render an **identical** compact header (eyebrow "Candidates" + h1
"Every candidate" + a one-line `meta`). This exists because Board used to
carry a tall editorial header while Ranking had none, so switching views
jumped the ViewToggle and all content ~124px vertically (2026-06-09: the owner
flagged that toggling "moves"). With the same header on both, the controls bar
+ toggle sit at the same Y on each page → no shift. The title was also
shrunk (`.funnel-header h1` scoped override in
[`workspace.css`](../app/workspace.css)) since it ate a lot of space. The
disabled "+ Add candidate" button was dropped (it was paused/non-functional).
Keep the `meta` to one line on both views so the header heights stay equal.

## View toggle ([`components/ViewToggle.jsx`](../components/ViewToggle.jsx))

The Board/Ranking switch. Originally two bare words that didn't read as
interactive (2026-06-09: the owner couldn't tell it was a toggle). Now a
single shared component: a "VIEW" eyebrow label, a segmented pill, an icon per
segment (kanban columns for Board, ranked bars for Ranking), the active
segment raised (white + shadow + accent icon), and a hover/focus lift on the
inactive one so it clearly reads as a clickable alternate view. Styles in
[`app/workspace.css`](../app/workspace.css) (`.view-toggle*`). Extracted so the
two pages can't drift; pass `active="board"` / `active="ranking"`.

## Voice: vacation app, not a decision tool (#68)

The product reframed (2026-06-09) from "rank → decide → verdict" to "find &
enjoy destinations." The funnel surfaces speak the kept **"would you go
back?"** question, never a verdict. The post-visit outcome is stored under
the historical `decision` values (`Advance` / `Winter Revisit` /
`Eliminate`), but every display goes through `decisionLabel()` in
[`lib/stages.js`](../lib/stages.js) → **Going back / Winter revisit / Not
going back** — one home so the Board chip, the `/assessed` archive filters,
and the Decide capture flow can't drift. The `/assessed` page is "Looking
back," not a "portfolio of decisions." `chipClass()` still keys the CSS color
off the stored value, so the helper is display-only.

Open, owner's call (left on #68): the **Ranking spreadsheet + per-axis
"minimum scores" sliders** are the most rank-and-decide-flavored surface
left. They're functional and were kept as-is rather than removed under the
new framing — a product decision, not a copy fix. CLAUDE.md's own
"decision tool / final judgment" framing in the header is likewise the
owner's to rewrite.

## Status

Stub — created 2026-06-09 alongside the ViewToggle redesign. The kanban,
ranking table, and learned weights predate this doc and aren't fully written
up here yet.
