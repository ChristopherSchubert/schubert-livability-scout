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
    button to preview the destination; never jumps into the past),
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
  local UI state. Lane order is local (no persisted order column yet —
  flag if persistence wanted).

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

## Status
- **Design: locked** (owner sign-off on the mockup, 2026-06-07).
- **Implementation: not started.** `TripCalendar.jsx` is the earlier
  drag-onto-calendar version; this supersedes its visual model.

## TODOs / future direction
- Port to the live route per the handoff above.
- Real `weeklyVisitScore` with a cited method (replace mock comfort arrays).
- Onboard **Bar Harbor, ME** (only demo city missing from `cities`).
- Decide whether lane order persists (add a column) or stays session-local.
- Consider crowd-intensity-scaled line prominence (mirror `ChapterWhen`).
