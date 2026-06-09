# Trip planner — swim-lane year view

A timeline planner for the **Visit** stage. Each candidate city is a
horizontal **lane** spanning the year; behind the lane is that city's
**visit-score** curve (weather vs. crowds), and on top sits a draggable
**trip box**. You plan by sliding each city's box to the week where its
curve is highest — and the committed trips collect in a lane up top, with
a "get ready" hover for each.

Reference prototype (the design source of truth until ported):
[public/trip-planner-swimlanes-mockup.html](../public/trip-planner-swimlanes-mockup.html).
A throwaway variant exploring raw weather/crowd lines lives at
`public/trip-planner-lines-demo.html` (now folded into the main mockup as
toggles).

---

## The model (what we landed on)

- **One lane per city**, sorted soonest-trip-first so the page reads as a
  cascade of upcoming trips; lanes are **drag-to-reorder** (grip on the
  city label) to override the sort.
- **Visit-score curve** per lane: a per-week 0–100 score blending comfort
  (heavy) against crowds (light), drawn as a smooth **area fill** colored
  **green → yellow → red** by score, with a **dot** on the best week in
  view and a dashed **threshold** line.
- **Trip box** overlays its own curve (frosted/translucent so the curve
  reads through it). Four ways to set a trip:
  - drag the **middle** to move,
  - drag an **edge** to resize,
  - **jump ‹ ›** to the next/previous week scoring ≥ threshold (hover the
    button to preview the destination; never jumps into the past). The chips
    reveal on **lane hover** (not just box hover) so they're easy to hit.
    Jump-right only moves to a *later* qualifying week — if the box already
    sits in/after a city's last qualifying window, there is none later and it
    won't move (use ‹ or drag),
  - **double-click** to type exact dates (start picker min = today).
- **Rich hovers, photo-topped** (real Supabase hero):
  - planning box → conditions for the span + "double-click to edit dates",
  - committed box → **"get ready" card**: countdown, span weather
    (high/low), rain over the trip, daylight, crowds, and a **packing
    suggestion** derived from the temps.
- **Timeline navigation**: grab the ruler or two-finger scroll to **pan**;
  **pinch** (or the Season/Months/Weeks/Days buttons) to **zoom**. The
  left edge is **clamped to today** — no scrolling into the past — and any
  **stale trip whose dates are in the past auto-shifts forward** to start
  today on load. Day **hash marks** + weekend shading give day-level
  placement.
- **Optional raw lines**: a **Feels-like** line (temperature) and a
  **Crowds** line can be toggled on per the planning-section controls;
  **off by default** (they cluttered; the score fill is the default read).

---

## Design study — retro (read this before redesigning)

This took ~44 iterations. The aesthetic was rarely the problem; **legibility
of the data was.** Each dead end taught a rule. Documenting them so we don't
re-walk the path.

| # | What we tried | Why it failed | Rule learned |
|---|---|---|---|
| 1 | Collapse the year to a single **Charm** + **Truth** month | Threw away 10 months of real signal; owner disliked the framing | Don't reduce rich monthly data to named anchors. Show the shape. |
| 2 | **Two-row heatmap** (weather row + crowd row, 12 cells each) | "Hard to read and distracting" | Two dense grids per lane overwhelm. One synthesized signal beats two raw grids for the glance. |
| 3 | Single **silhouette/area curve**, "aim for the top" | "Too imprecise… not a scientific planning process," and the scale was wrong (a 6-day trip stretched across ~1.5 months) | A vibe-curve with no numbers and dishonest scale fails. Precision must be reachable; the time axis must be honest. |
| 4 | **Numbers in every cell** (avg high per week) | "I have no intuitive understanding when I look at this" | Raw numbers give precision but no gestalt. Need a visual carrier too. |
| 5 | **Color tiers** per cell | "Everything looks green"; crowded | Monochrome-by-fill kills the gradient. Tiers need real contrast or they read flat. |
| 6 | **Score number, big, in each cell** | "I just see 48 and don't get why" | A number with no frame of reference is noise. Pair it with a bar/curve that shows *why*. |
| 7 | Color **and** bar-height both encoding score | "Is color and height the same thing?" | One visual channel per variable, and **explain it**. No redundant unexplained encodings. |
| 8 | Score as a **bare number in the trip box** | "no label anywhere — get it out" | **Never show a number without a label/unit.** Numbers live where they're labeled (the hover). Color/shape carry the at-a-glance. |
| 9 | Monthly-step scores drawn as a **polyline** | "wacky lines" — flat runs then cliffs | Interpolate data to the render granularity (weekly), then draw a **smooth spline**. |
| 10 | SVG stretched ~16× via `preserveAspectRatio="none"` + `non-scaling-stroke` | **Safari dropped stroke segments → visible gaps** (invisible in DOM inspection; renderer-specific) | Render lines in **pixel space**; avoid extreme anisotropic SVG scaling. Verify in the real browser, not just the DOM. |
| 11 | Autoscale each lane to its **visible** min/max | Lines "breathe" on pan; not comparable across lanes | Use an **absolute** y-domain (cross-row comparability). Let **color** carry quality so absolute height isn't flat-and-meaningless. |
| 12 | **Opaque** trip box over the curve | "literal gaps in the line" — the box severed it | Overlays must be **translucent/frosted** so the data reads through. |
| 13 | Feels-like + crowd lines always on | Cluttered | Make secondary signals **toggleable, default off.** |
| 14 | Planning controls in the **top-right** toolbar | "this stuff is in the wrong place" | Place each control **next to what it affects** (lane controls in the lane section; only truly global controls in the corner). |
| 15 | Date range shown **inclusive** ("Jun 7–13" = "7 nt") | Off by one — that's 6 nights | Use **check-in → check-out** convention: 7 nights = Jun 7–14. |
| 16 | Placeholder (Picsum) hero images | Not the product | Pull **real `hero_image`** from Supabase; resolve live once in-app. |

**Process lessons:**
- The repeated "I don't get it" was the signal that **polish ≠ legibility**.
  When a viz needs a paragraph of explanation, the encoding is wrong.
- **Read the actual rendered data** (path coordinates, `getComputedStyle`)
  instead of trusting screenshots — that's how the month-cliff bug and the
  Safari gap were diagnosed. Some bugs are renderer-specific and only the
  user's browser shows them.
- **Mockup-first** (static HTML in `/public`) let us iterate the interaction
  model dozens of times cheaply before touching the real route. Keep doing
  this for interaction-heavy features.
- Build controls by **scope**: global (zoom/pan) vs. contextual (toggles,
  threshold) — and colocate the contextual ones with their section.

---

## Implementation handoff (porting into `/visit/calendar`)

The live route + component already exist
([app/visit/calendar/page.js](../app/visit/calendar/page.js),
[components/TripCalendar.jsx](../components/TripCalendar.jsx) — the latter
already has `DEFAULT_DAY_PX / MIN_DAY_PX / MAX_DAY_PX` zoom constants stubbed
in). Replace/extend that component with the swim-lane model.

### Data (already in Supabase — no schema change needed)
Per city, via `rowToCity` / `cityItem`:
- `visitClimate` — 12 × `{hi, lo, precipDays, daylightHr}` (NASA POWER). Use
  `monthComfort()` in `lib/planner-data.js` for the comfort term and the
  raw values for the hover (high/low, rain, daylight).
- `crowdSeason` — 12 × 0–5 (shape); `crowdIntensity` 0–5 (magnitude).
- `heroImage` — resolve via `resolveImage(cityItem.heroImage, cityImageQuery(...), imageState)`.
- `arriveDate` / `departDate` — the trip box; persisted via `updateCity`
  (already whitelisted in `mapWritable`).
- `cityStage()` selects which cities are Planned vs Planning vs Backlog.

### New domain logic (put in `lib/planner-data.js`, the godfile — with citation)
1. `weeklyVisitScore(cityItem)` → 53 ints 0–100. Per ISO week, take the
   month of the week's midpoint, compute
   `score = comfort/5*0.70 + (5 - crowd)/5*0.30` × 100, then **interpolate
   between month centers to the week** (the mockup's `wscore`). Document the
   weighting + interpolation as the method string (project rule: every
   derived value carries its method). Reconcile with the existing
   `cityVisitWindow()` so Charm/Truth and this share one comfort source.
2. Helpers: `weeklyTemp/Crowd/etc.` from `visitClimate`/`crowdSeason`.

### Component shape
- `TripPlanner.jsx` (rename/replace `TripCalendar.jsx`), mounted by the
  route inside `AppShell activeMode="visit"`.
- **Geometry is CSS-variable driven**: `--day-w` (zoom) + `--pan-x` (offset)
  on a root element; every position is `calc(var(--day-w) * dayIndex)`. This
  is what makes pan/zoom cheap. Year spans `VIEW_START` (Monday on/before
  Jan 1) for 53 weeks.
- **Charts in pixel space**: per lane an `<svg>` whose `viewBox` is set in
  JS to `0 0 (dayW*N) 100` each redraw (NOT `preserveAspectRatio="none"`
  stretch — that triggers the Safari gap bug). Path x = `(week*7+3.5)*dayW`.
  Smooth with Catmull-Rom→bézier. **Absolute** y-domain 30–95. Area fill =
  a per-lane horizontal `userSpaceOnUse` gradient with per-week
  green→yellow→red stops; redraw updates its `x2`.
- **Score color ramp**: red `#b5402c` → yellow `#d6b13f` → green `#4f8a3f`,
  interpolated over score 40–80; fill-opacity ~0.38.
- **Trip box**: frosted (`background:rgba(255,253,246,.72); backdrop-filter:
  blur(2.5px)`), pointer-event drag (move/resize), jump buttons OUTSIDE the
  box edges (don't overlap resize handles), `dblclick` editor. Box line 1 =
  dates (check-out convention), line 2 = `N nt · 82°F · busy` (no naked
  score). "nt" in the box, "nights" spelled out in popups.
- **Pan/zoom**: wheel `deltaX` (and shift-wheel) pan; `ctrlKey` wheel =
  pinch-zoom anchored on the cursor; ruler `pointerdown` drag to pan.
  `clampPan`: max = `-(TODAY_DAY*dayW)` (today at left, no past). On mount,
  shift any planning trip with `start < today` to start today.
- **State**: threshold (default **65**) + Feels-like/Crowds toggles are
  local UI state. Lane order **persists** to the shared `planning_order`
  column (migration 0009) — see the Interactions section.

### Build sequence
1. `weeklyVisitScore` + helpers in `lib/planner-data.js` (+ method string).
2. Port the CSS-variable geometry + pixel-space SVG redraw from the mockup
   into `TripPlanner.jsx` and `app/workspace.css` (`.trip-pl-*`).
3. Wire real data: lanes from `cityStage`, hero via `resolveImage`, dates via
   `updateCity`. Hovers read live `visitClimate`.
4. Pan/zoom + today-clamp + stale-shift.
5. Trip box interactions (drag/resize/jump/dblclick) → `updateCity`.
6. Toggles, threshold, committed "get ready" hover, day hash marks.
7. Verify in a real browser (Safari especially — the stroke-gap bug).

### Watch-outs (hard-won)
- Don't stretch the SVG anisotropically (Safari gaps). Pixel-space + set
  viewBox per redraw.
- Absolute y-domain, not per-view autoscale.
- Translucent box, never opaque.
- Check-in→check-out date math (nights = depart − arrive).
- Every number labeled; the bare score lives only in the labeled hover.

---

---

## Handoff Spec (via design:design-handoff)

Generated with the design-handoff framework against the locked mockup.
Stack: **Next.js app-router + React, plain CSS** (`app/workspace.css`),
project tokens in `app/globals.css`. No Tailwind, no component lib.

### Overview
Visit-stage planner. Three stacked sections — **Planned** (committed
trips, one consolidated lane), **Planning** (one lane per candidate city
with its visit-score curve + draggable trip box), **Backlog** (candidate
cards to promote). The whole time area pans/zooms as one; the label column
is fixed.

### Design tokens
Project tokens (reuse from `globals.css`): `--bg #fbf6ea`, `--paper
#fffdf6`, `--panel #f4eddc`, `--border #d8ccb8`, `--rule #c1b69e`, `--text
#1b1814`, `--muted #7a7268`, `--accent #0d4c44`; `--font-display Fraunces`,
`--font-ui "Inter Tight"`.

Planner-specific tokens:
| Token | Value | Usage |
|---|---|---|
| `--label-w` | `236px` | fixed left column (city labels) |
| `--day-w` | `16px` default (zoom var) | px per day; drives ALL x-geometry |
| `--week-w` | `calc(var(--day-w)*7)` | week gridlines |
| `--pan-x` | px (pan var) | `translateX` of every `.scroller` |
| `--track-h` | `62px` | planning lane height |
| score ramp | `#b5402c → #d6b13f → #4f8a3f` over score 40–80 | area fill (`fill-opacity .38`) |
| feels-like line | `#c2823f` solid 1.5px | toggle |
| crowd line | `#5b7a99` dashed `5 4` 1.5px | toggle |
| threshold line | `#8a5a22` dashed | ≥ marker |
| best-week dot | `#2f4a23` r≈3.5 | per lane |
| zoom range | `--day-w` clamped **6–44px**; default 16 | Season→Days |
| score y-domain | **absolute 30–95** | NOT autoscaled |
| jump threshold | default **65** (0–100, step 5) | configurable |

### Components / states
| Element | State | Behavior |
|---|---|---|
| Trip box (planning) | rest | frosted `rgba(255,253,246,.72)` + `backdrop-filter: blur(2.5px) saturate(1.1)`, 1.5px `--accent` border, h 40px; line1 dates, line2 `N nt · 82°F · busy` |
| Trip box | hover | resize handles fade in (`opacity .6`, edges); jump ‹ › chips appear just outside L/R; rich hover card (photo-topped) |
| Trip box | dragging | grab→grabbing cursor, stronger shadow, z raised; live date/conditions update; snaps to whole days |
| Resize handle | hover | edge strip `opacity 1`, `ew-resize` |
| Jump ‹ › | hover | popover preview (target week, ±N weeks, score) or "No later/earlier week ≥ TH"; disabled into past |
| Trip box | dblclick | editor popover: Start `<input type=date min=today>` + Nights `<input type=number 1–60>`, Apply/Cancel |
| Committed box | locked | `cursor:default`, no handles/drag; hover = "get ready" card (countdown, weather, rain, daylight, crowds, pack) |
| City label | hover/drag | grip (⠿) grab cursor; drag ↕ reorders lanes live |
| Ruler | hover/drag | grab→grabbing; drag pans |
| Backlog card | hover | lift `translateY(-3px) rotate(-.5deg)` + shadow |

### Responsive
| Breakpoint | Changes |
|---|---|
| Desktop (default) | label-w 236 + scrollable time area; 8–10 lanes visible |
| ≤1100px (mockup precedent) | tray/backlog stacks; cards go to a wider grid. **Planner lanes are horizontal-scroll heavy → treat as desktop-first; mobile is out of scope for v1** |

### Edge cases
- **Empty (no Planning cities)**: show the Backlog with a "drag up to plan" prompt; hide the Planning section header controls.
- **No `visitClimate`/`crowdSeason`**: render the lane with no curve + a muted "conditions not measured" note; trip box still draggable. (Per project rule: blank, not faked.)
- **Stale trip (dates in past)**: auto-shift forward to start today on load.
- **No qualifying week ≥ threshold**: jump buttons no-op with "No later/earlier week ≥ N".
- **Long city names**: ellipsis in label and box; full name in hover header.
- **Narrow box (short trip)**: line text spills with a paper text-shadow halo rather than clipping; box stays true-duration width.
- **Missing hero**: blank tile with city initial (existing `resolveImage` fallback).

### Animation / motion
| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Resize handles / jump chips | hover | opacity in | 120ms | ease |
| Trip box | hover/drag | shadow + 1px lift | 140ms | ease-out |
| Backlog card | hover | lift + rotate | 160ms | cubic-bezier(.2,.7,.3,1) |
| Curves on pan/zoom | redraw | instant re-path (no tween) | — | — |

### Accessibility (gaps to close in the real build — mockup is pointer-only)
- **Keyboard**: trip box needs focusability + arrow-key move/resize (←→ day, ⌥←→ resize), Enter→date editor, Esc→cancel. Jump = `[`/`]`. Lanes reorderable via a keyboard affordance.
- **ARIA**: each lane `role="group"` labelled by city; trip box `role="slider"` or a labelled button with `aria-valuetext="Asheville, Jun 7–14, 7 nights, visit score 64"`. Threshold/toggles are native inputs (fine).
- **Screen reader**: announce on move/resize ("moved to Jun 14–21, visit score 71"). The visual curve needs a text equivalent — the hover card content is that equivalent; expose it as the box's accessible description.
- **Contrast**: score number/labels on `--paper` pass AA; verify the amber/slate toggle lines aren't the sole signal (they're labelled by the toggles).
- **Touch targets**: 6–9px resize handles are below 44px — widen hit area on coarse pointers.

---

## Working with the mockup (resume notes)
- The mockup HTML is **standalone & hand-editable** — there is **no build
  step in the repo.** It was originally generated by throwaway Python
  scripts in `/tmp` (gone after compaction); don't go hunting for a
  pipeline. Edit `public/trip-planner-swimlanes-mockup.html` directly.
- View it via the dev server: `npm run dev` then
  `localhost:3000/trip-planner-swimlanes-mockup.html`. (The dev server in
  this workspace tends to die between sessions — just restart it. Verify in
  **Safari** specifically; the SVG stroke-gap bug is WebKit-only.)
- The real hero URLs were pulled from Supabase by signing in as the dev
  user (`scripts/hero-audit.mjs` is the client pattern) and reading
  `cities.hero_image`. Bar Harbor, ME isn't in the table → placeholder.

## Status
- **Design: locked** (owner sign-off on the mockup, 2026-06-07).
- **Implementation: LIVE.** Routing (Visit section):
  - **`/visit`** → the planner (the **default Visit view**, 2026-06-07).
  - **`/visit/planned`** → `VisitWorkspace` ("Planned and active trips" — the
    committed-trip list + per-city logistics); linked from the planner header
    ("Planned trips →").
  - **`/visit/calendar`** → also the planner (back-compat).
  The swim-lane planner replaced the old drag-onto-a-wall-calendar model:
  - `lib/planner-data.js#weeklyVisitScore(cityItem, viewStart)` — the real
    cited curve (Phase 1).
  - `components/TripPlanner.jsx` — the component. CSS-var geometry + pixel-
    space SVG (viewBox set per redraw → no Safari stroke-gap). Pan/zoom/
    drag/resize/jump/dblclick + photo-topped hovers, all ported faithfully
    from the mockup and verified in-browser (Chromium): 53-stop gradient,
    absolute y-domain, week hover (`Santa Cruz · Jun 15 · 84 · 75/51°F`),
    drag (`Jun 8–15`→`Jun 18–25`), jump preview (`Aug 31 · 71 · 11 weeks`).
  - `app/trip-planner.css` — all `.trip-pl-*` styles (separate file, imported
    in `app/layout.js`; kept out of the WIP-dirty `workspace.css`).
- **Window**: Monday-on/before the 1st of the current month, 53 weeks
  forward (robust year-round; today clamped to the left edge, no past).
- **Section mapping (v1 decision)** — uses existing fields, no new column:
  - **Planned** = `status === "Scheduled"` + both dates (locked; get-ready
    hover; ↩ to un-commit, sets `status:""`).
  - **Planning** = `cityStage` ∈ {`visit`, `calibrate`} and not committed.
    Each is a draggable lane + curve; ✓ commits (`status:"Scheduled"`).
  - **Backlog** = `cityStage === "shortlist"`. Cards; click promotes
    (`status:"Shortlist"` → calibrate → a Planning lane appears).
  - **Reality of current data**: statuses are only `"Idea"` (→ Backlog) and
    `"Scheduled"` (→ Planned). So **Planning starts empty** by design — you
    populate it by promoting from the Backlog pane at the bottom (owner-
    confirmed model, 2026-06-07). The empty state points there.

### Interactions ported (full set, 2026-06-07)
- **Lane sort** — a segmented control in the Planning header: **None**
  (manual), **Next trip** (by the scheduled box, the default), **Best now**
  (by each city's visit score *this week*, highest first — surfaces where to
  go right now, not the yearly peak). Session-local `sortMode`.
- **Lane drag-to-reorder** — grip (⠿) on each lane label; pointer-drag ↕
  reorders. Dragging snapshots the visible order and switches sort to
  **None** (manual). The manual order is **persisted** to the shared
  `planning_order` integer column (migration 0009): written debounced from
  the `order` state on drag, and on load the lanes seed from it and default
  to the **None** sort. Null = no manual position (sorts after positioned).
- **Demote from Planning** — `×` on the lane label (always faintly visible)
  opens a **confirm popover** ("Remove <city> from planning?" · Remove /
  Cancel); Remove sets `status:"Idea"` **and clears arrive/depart dates** →
  the lane drops back to the Backlog. (Clearing dates is required: a city
  with dates resolves to the `visit` stage via `cityStage` regardless of
  status, so status alone wouldn't remove a dated lane.)
- **Backlog drag-into-lanes** — pointer-drag a Backlog card; a ghost follows
  the cursor; dropping over the lanes promotes it (`status:"Shortlist"`), and
  dropping **on a lane's timeline** also sets the trip to that week (reads
  live `--day-w`/`--pan-x`, clamped to today). A plain click still promotes.
- All three verified in-browser (Chromium): reorder moves the dragged lane;
  ghost tracks + cancels cleanly on an off-target drop.

### Backlog sort + filter (2026-06-09)
The Backlog grew to 100+ cities, so the pane below Planning gained a control
bar (`.bl-ctl`) above the card grid. All controls are **session-local** (no
persistence) and operate on real measurements — an unmeasured value is `null`,
never a fake 0, so it always sorts last (per the no-invented-data rule).

- **Name filter** — `.bl-search` substring match (case-insensitive) on the
  full city name. Backed by `blQuery`.
- **Sort** — a `<select>` (`blSort`, options in module-level `BACKLOG_SORTS`):
  four **Best week · {season}** options (Spring / Summer / Fall / Winter),
  then **Overall** (`weightedAxisScore(c, EQUAL_WEIGHTS)`, 0–10), the **5
  axes** (Setting / Aliveness / Fabric / Realness / Year-round, off
  `axisRollup`), **Gut score** (`feltScore(c.survey)`), and **Name A–Z**.
  Score sorts are descending with nulls last and ties broken by name; name
  sorts A–Z. Default is the season we're in now (`best-${current season}`).
  - **Why per-season, not a single peak (2026-06-09 fix).** The first cut
    sorted by the *yearly* peak of `weeklyVisitScore`. That hid *when* the
    good window was — a city peaking at 94 in November ranked next to one
    great right now, so the owner promoted a city whose best week was three
    months out. Now the best week is computed *within each meteorological
    season* (`MONTH_SEASON` maps each week's month to a season; we keep the
    max score per season in `seasonPeak`), and you sort by the season you're
    actually considering. Summer surfaces mild-summer coastal CA and sinks
    hot-humid Southeast; winter flips it.
- **State** — a `<select>` (`blState`) populated from the states actually
  present in the backlog (`backlogStates`), plus "All".
- **Measured** / **Surveyed** toggles — keep only cities with an overall
  measured score / a completed gut score, respectively (`blMeasuredOnly`,
  `blSurveyedOnly`).
- Each card shows a **score chip** (`.bkbadge`) in the thumbnail corner
  reflecting the active sort's value (the 0–100 best-week score, or the 0–10
  axis/overall/gut value), so the ranking is legible. Hidden for the Name
  sort and for unmeasured cities. Built by the `backlogBadge()` helper.
- The header `.sub` shows `N cities` or `M of N` when filtered; a `.bl-none`
  message renders when filters exclude everything.

Derived in `shownBacklog` (filter → sort) off `backlogRows` (per-city
`seasonPeak` / rollup / overall / gut, memoized on `backlog` + `viewStart`).
Verified in-browser: summer ranks coastal-CA top / hot-SE bottom, winter
flips to FL-top / cold-N bottom, overall 7.6→3.1, CA state filter, no-match
empty state.

### Audit vs the mockup (2026-06-07)
Fixed after a side-by-side audit with real data populated in Planning:
- **Planning-box hover hero** was querying `.trip-pl-thumb` (committed-bar
  class) instead of the planning lane's `.lthumb` → no photo. Fixed.
- **`.lrec`** restored to the mockup wording "Best score N · week of …".
- **Committed trips that overlap in time now stack on rows** (greedy
  assignment) instead of colliding on one track; the Planned track height
  grows with the row count. The mockup only ever had one committed trip.
- **In-progress committed trip** (started before today) no longer clips at
  the left edge — the pan-left bound is `min(today, earliest committed
  start)`; planning a box into the past is still blocked.
- **↩ un-commit** moved to a hover-only corner chip (was crowding the bar).

Minor, intentionally not matched (additions/divergences, flag if wanted):
- No day-of-week letter row in the ruler (mockup had M T W… + weekend
  shading). Day **hash lines** are present via the track background.
- Grip is a single `⠿` and drags from the grip only (mockup: `⠿⠿`, whole
  label draggable).
- Backlog card subtitle is "drag up ↑" (mockup: "~7 nights").
- ✓ commit / ↩ un-commit / × demote / backlog drag-to-place are additions
  beyond the static mockup.

## TODOs / future direction
- Manual **Safari** pass on a populated Planning section (the pixel-space
  fix is structurally in place; Chromium verified).
- Onboard **Bar Harbor, ME** (only demo city missing from `cities`).
- Consider crowd-intensity-scaled line prominence (mirror `ChapterWhen`).
