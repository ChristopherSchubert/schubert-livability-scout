# Candidate funnel — Board ⇄ Ranking

Two lenses on the **same** candidate set, switched by a shared toggle:

- **Board** (`/board`, [`FunnelBoard.jsx`](../components/FunnelBoard.jsx)) — a
  5-stage kanban (Backlog → Planning → Planned → Visited → Assessed). Drag a
  card between Backlog and Planning to move it; the later stages need data
  entered on their own pages, so the Board offers no advance button for them.
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

## View toggle ([`components/ViewToggle.jsx`](../components/ViewToggle.jsx))

The Board/Ranking switch. Originally two bare words that didn't read as
interactive (2026-06-09: the owner couldn't tell it was a toggle). Now a
single shared component: a "VIEW" eyebrow label, a segmented pill, an icon per
segment (kanban columns for Board, ranked bars for Ranking), the active
segment raised (white + shadow + accent icon), and a hover/focus lift on the
inactive one so it clearly reads as a clickable alternate view. Styles in
[`app/workspace.css`](../app/workspace.css) (`.view-toggle*`). Extracted so the
two pages can't drift; pass `active="board"` / `active="ranking"`.

## Status

Stub — created 2026-06-09 alongside the ViewToggle redesign. The kanban,
ranking table, and learned weights predate this doc and aren't fully written
up here yet.
