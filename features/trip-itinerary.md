# Trip itinerary — design doc / handoff spec

> ⚠️ **SUPERSEDED (2026-06-11).** This single-format hour-grid was replaced
> by the multi-format component system in
> [trip-planner-components.md](trip-planner-components.md), whose canonical
> realization is the **Plan · Shelf · Days · Book · Grid** flow in the
> walkthrough deck ([public/mockups/trip-walkthrough.html](../public/mockups/trip-walkthrough.html),
> state doc [trip-walkthrough-review.md](trip-walkthrough-review.md)). Kept
> for the data-foundation notes (the `itinerary` jsonb column) and the
> Janice/`Slovenia.xlsx` "definition of done." Build against the deck, not
> this. Class/route references below were repointed to the live
> `TripPlanner.jsx` only to avoid dangling links.

> Status: **step 1 (data foundation) shipped; grid not built yet.** This is
> the spec for the hour-by-hour itinerary surface. Modeled on the real trip
> planner the owner's partner (Janice) builds in Excel: a time-grid where
> every cell is a committed, logistics-complete decision. See the source
> artifact `Slovenia.xlsx` (Ljubljana → Bled → Soča → Piran, May 2026) for
> the reference of "done."
>
> **Done so far:** `itinerary` jsonb column (migration 0012, applied) +
> `lib/city-row.js` round-trip + `lib/db.js` mapPatch; the real Slovenia
> trip seeded across the Ljubljana / Bled / Piran rows (79 entries) by
> `scripts/seed-slovenia-itinerary.mjs`. **Next:** the read-only grid
> (step 2 of the build sequence).

## Overview

The three existing visit surfaces stop at *which city, which week*:

| Surface | Route | Answers |
|---|---|---|
| `TripPlanner` | `/planning/calendar` | which city, which week, how many nights |
| `VisitWorkspace` | `/visit` | my planned/active trips at a glance |
| Trip plan (per city) | `/cities/<slug>/plan` → `VisitPlanRoute` | stay zone, lodging, flight — **freeform prose** |

The itinerary is the layer **below** scheduling: once a trip window exists
on the city row (`arriveDate`/`departDate`), it fills those days **hour by
hour** with typed entries. It lives as a new section on the per-city plan
page, beneath the existing lodging/flight prose — that prose stays; the grid
is the structured companion to it.

The diagnostic Janice's spreadsheet proves: **every slot resolves a
decision so there are none left on the ground.** "What do I do at 10:30 on
Tuesday" has an answer, with the meeting point, the confirmation code, and
whether it needs cash.

### What it must reproduce from the source artifact

1. **Time grid** — time rows (≈05:00–22:00) × day columns, entries dropped
   into slots.
2. **Janice's color Key** — every entry is one of six kinds:
   `booked · flexible · travel · meal · checkin · todo`.
3. **Booking metadata** — confirmation code, prepaid flag, cancellation
   deadline, phone/contact, URL.
4. **Inline logistics** — free-text notes living *in the entry where you'll
   need them* (meeting point "look for the yellow doors", clothing,
   "pay in cash after the flight"), not in an appendix.
5. **Two derived rollups** — a **Cash Needed** tally (cash-only costs summed,
   like her `Cash Needed` sheet) and a **Bookings ledger** (everything with a
   confirmation code + its cancellation deadline).

---

## Data model (the one rule: never invent, never in-source)

Storage is a single Supabase **`jsonb` column `itinerary`** on `cities`,
round-tripped like every other per-city attribute. **No** `const
itineraryByCity = {…}`, no CSV, no seed map.

### Wiring checklist (mirrors the lodging/flight precedent)

1. `supabase/schema.sql` — `itinerary jsonb` on `cities`, default `null`.
2. `supabase/migrations/<ts>_add_itinerary.sql` — `alter table cities add
   column itinerary jsonb;`
3. `lib/city-row.js` — `cityToRow`: `itinerary: c.itinerary ?? null`;
   `rowToCity`: `itinerary: r.itinerary || null`.
4. `lib/db.js` `mapPatch` — `itinerary: "itinerary"`.
5. Runtime reads `cityItem.itinerary` from the row — never a literal.

### Shape

```jsonc
// cityItem.itinerary
{
  "dayStart": "05:00",        // grid top edge, optional; default 05:00
  "dayEnd":   "22:00",        // grid bottom edge, optional; default 22:00
  "entries": [
    {
      "id": "e_<stable>",      // generated client-side; stable for drag/edit
      "day": "2026-05-19",     // YYYY-MM-DD, must fall in [arriveDate, departDate]
      "start": "05:30",        // HH:MM, snapped to 30-min grid
      "end":   "08:00",        // HH:MM; end > start; spans N slots
      "kind":  "booked",       // booked|flexible|travel|meal|checkin|todo
      "title": "Hot air balloon — private",
      "note":  "Pickup 05:35 in front of Hotel Toplice. Sturdy shoes, dress warm.",
      "confirmation": "401780164673",
      "prepaid": true,
      "cost":    { "amount": 380, "currency": "EUR", "cashOnly": true },
      "cancelBy": "2026-05-12", // optional ISO date; feeds the ledger
      "url":      "https://…",  // optional
      "contact":  "+386 41 664 545"   // optional
    }
  ]
}
```

**Derivation, not duplication.** Day columns are computed from
`arriveDate`/`departDate` — the itinerary never restates the trip dates. An
entry whose `day` falls outside the window is *orphaned* (see Edge cases),
not silently dropped. Cash Needed = `sum(cost.amount where cost.cashOnly)`,
grouped by currency. Bookings ledger = entries with `confirmation` OR
`cancelBy`, sorted by `cancelBy` ascending (soonest deadline first).

**Writes** follow the `TripPlanner` discipline: live drag is visual only;
`updateCity(id, { itinerary })` fires once on `pointerup`/popover-save, so
Supabase sees one write per gesture, never one per pixel.

---

## Layout

A horizontally-scrolling grid inside the plan page, full content width.

```
┌─ Itinerary ──────────────────────────────── [Cash €1127 ▸] [Bookings 4 ▸] ┐
│        │ Fri 15 │ Sat 16 │ Sun 17 │ Mon 18 │ … (one column per trip day)   │
│ 05:00  │        │        │        │        │                               │  ← time gutter (sticky left)
│ 05:30  │        │        │ ▓ Balloon pickup ▓ │                            │
│ 06:00  │        │        │ ▓  (entry spans  ▓ │                            │
│ 06:30  │        │        │ ▓   5 slots)     ▓ │                            │
│  …     │                                                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Time gutter** — sticky left column, ~56px, `--font-ui` tabular figures,
  `--muted`. Half-hour rows. Drive geometry off a `SLOT_PX` constant the
  way `TripPlanner` drives the calendar off `DEFAULT_DAY_W` / `--day-w`.
- **Day header row** — sticky top. Weekday in `--font-display` italic
  (matches the calendar's month labels), date in small-caps Inter Tight
  tabular. The day that is "today" (if the trip is live) gets the deep-green
  rule treatment from `.trip-pl-today`.
- **Columns** — one per day from `arriveDate` to `departDate` inclusive.
  Min column width ~160px so an entry title is legible; grid scrolls
  horizontally past ~5 days, same `trip-pl-scroller` pattern.
- **Entry block** — absolutely positioned within its day column;
  `top = (slotsFromDayStart) × SLOT_PX`, `height = spanSlots × SLOT_PX`.

### Grid constants (mirror `TripPlanner`)

| Constant | Value | Notes |
|---|---|---|
| `SLOT_PX` | 22 | one 30-min row, matches calendar's day rhythm |
| `SLOT_MIN` | 30 | snap unit (minutes) |
| `DAY_START` / `DAY_END` | `05:00` / `22:00` | default grid bounds; per-trip override |
| `COL_MIN_W` | 160px | min day-column width |
| `GUTTER_W` | 56px | time gutter |

---

## Design tokens used

All real, from `app/globals.css` / `app/city-detail.css`. The **six kind
colors are new** and must be added once — derived from the existing warm
palette, not invented from scratch. Booked anchors on the product's
deep-green identity; meal/travel reuse the amber and slate-blue seasonal
wash hues already used in the calendar's visit-window bands so the surface
reads as one family.

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#fbf6ea` | grid paper |
| `--panel` | `#fffdf6` | entry card fill (flexible/default) |
| `--panel-strong` | `#f4eddc` | gutter + header band |
| `--border` | `#d8ccb8` | gridlines, hairlines |
| `--text` | `#1b1814` | entry titles, day numbers |
| `--muted` | `#6b6358` | times, secondary meta (AA-safe, do not lighten) |
| `--accent` | `#0d4c44` | booked entries, primary actions, today rule |
| `--accent-soft` | `#d2e6e1` | booked entry fill tint |
| `--font-display` | Fraunces | weekday labels, section title |
| `--font-ui` | Inter Tight | all grid text, times, metadata |
| `--radius` | 14px | popover; entries use a tighter 6px |

### New tokens — entry-kind palette (add to `:root`)

| Token | Value | Kind | Rationale |
|---|---|---|---|
| `--kind-booked` | `#0d4c44` | **Booked** | the product accent; "locked" = green |
| `--kind-booked-fill` | `rgba(13,76,68,0.10)` | | tinted card |
| `--kind-meal` | `#a0601c` | **Meal** | the calendar's amber seasonal wash, full strength |
| `--kind-meal-fill` | `rgba(212,142,56,0.14)` | | the amber wash hue `rgba(212,142,56)` |
| `--kind-travel` | `#2e5482` | **Travel** | the calendar's slate-blue seasonal wash |
| `--kind-travel-fill` | `rgba(46,84,130,0.12)` | | the slate-blue wash hue `rgba(46,84,130)` |
| `--kind-checkin` | `#6e5a8c` | **Check-in** | muted plum, distinct from travel |
| `--kind-checkin-fill` | `rgba(110,90,140,0.12)` | | |
| `--kind-todo` | `#8a6a2c` | **To-do** | warm ochre, "needs action" |
| `--kind-todo-fill` | `rgba(138,106,44,0.12)` | | |
| `--kind-flexible` | `--border` / `--muted` | **Flexible** | no fill, dashed hairline — "not yet committed" |

Every kind color must clear **WCAG AA 4.5:1** for its text on its own fill
and on `--bg` (the `--muted` darkening on 2026-06-09 was exactly this kind
of fix — verify, don't assume). Booked/meal/travel/checkin/todo confirmed
≥4.5:1 on paper at the values above; re-check after any tweak.

---

## Components

| Component | Variant / prop | Notes |
|---|---|---|
| `TripItinerary` | `slug` | top-level; reads `cityItem`, derives day columns from dates, owns drag state (one global `pointermove`/`pointerup` in a `useEffect`+ref, exactly like `TripPlanner`) |
| `ItineraryGrid` | — | scroll shell, gutter, day headers, gridlines, today rule |
| `ItineraryEntry` | `kind` (6), `isDragging`, `compact` | the positioned block; left color spine in `--kind-*`, title + time + kind icons (🔒 prepaid, € cash, ⚑ has-confirmation) |
| `EntryPopover` | `mode: create \| edit` | form: title, day/start/end, kind selector (the 6 swatches), note (multiline), confirmation, prepaid, cost+currency+cashOnly, cancelBy, url, contact. Save → one `updateCity`. Delete → remove from `entries` |
| `CashNeededDrawer` | — | grouped-by-currency tally of `cashOnly` costs; mirrors her `Cash Needed` sheet |
| `BookingsLedger` | — | table: entry · confirmation · cancelBy (with "refundable until" countdown) · prepaid; sorted soonest-deadline-first |
| `KindLegend` | — | the six swatches + labels, reproduces her Key; doubles as a filter (click a kind to dim the rest) |

Domain helpers belong in `lib/planner-data.js` (the godfile rule):
`itineraryDayColumns(cityItem)`, `cashNeeded(itinerary)`,
`bookingsLedger(itinerary)`, `slotIndex(hhmm, dayStart)`. Components stay thin.

---

## States and interactions

| Element | State | Behavior |
|---|---|---|
| Empty slot | hover | faint `--accent-soft` fill + "+" affordance |
| Empty slot | click | open `EntryPopover` (create) pre-filled with that day + start time, `end = start + 1 slot`, `kind = flexible` |
| Empty slot | drag (down) | rubber-band a duration; release opens create popover with that span |
| Entry | hover | lift shadow (reuse `.trip-pl-bar:hover` box-shadow), reveal top/bottom resize handles + "×" delete |
| Entry | click (no drag) | open `EntryPopover` (edit) |
| Entry | drag body | move within/across day columns; snap to 30-min + day; live-preview only, commit on `pointerup` |
| Entry | drag top/bottom handle | resize start/end; clamp `end > start`, keep inside `[dayStart,dayEnd]` |
| Entry | `prepaid` | 🔒 glyph; ledger marks "prepaid — no action" |
| Entry | `cost.cashOnly` | € glyph in `--kind-todo`; contributes to Cash drawer |
| Kind swatch (legend) | click | toggle-filter — non-matching entries drop to 35% opacity |
| Cash / Bookings chip | click | slide-down drawer; Esc or re-click closes |
| Popover | save with invalid time (`end ≤ start`) | inline error under the time row, save disabled |
| Popover | `day` outside trip window | warn "outside trip dates" but allow (orphan), surfaced in header |

Live drag math is `Δpx ÷ SLOT_PX` for time and column hit-testing for day —
the same model as `TripPlanner.jsx` (write via `updateCity` on `pointerup`).

---

## Responsive behavior

The hour grid is a desktop/tablet instrument; it does not survive a phone
viewport. Per the canonical breakpoints in `globals.css`:

| Breakpoint | Changes |
|---|---|
| Desktop (>1024px) | full grid, ~5 day columns before horizontal scroll |
| Tablet (≤1024px) | `COL_MIN_W` → 132px; Cash/Bookings collapse to icon chips |
| Phone (≤640px) | **grid is replaced by a stacked per-day agenda** — one day section at a time (swipe/segmented control to change day), entries as a vertical timeline list with the same color spine + glyphs. Edit via full-screen sheet, not popover. This is the one-handed read; the grid is for planning at a desk. |

The phone agenda renders from the identical `entries` data — no second
model. It's a view swap at the render layer.

---

## Edge cases

- **No trip dates yet** (`arriveDate`/`departDate` empty) — grid can't derive
  columns. Show an empty state: "Set this trip's dates on the calendar to
  start the itinerary," linking `/planning/calendar`. Don't render an
  open-ended grid.
- **Single-day trip** — one column; grid still valid.
- **Long trip (>10 days)** — horizontal scroll; a faint day-count and
  "scroll →" fade (reuse the `--fade-r` city-context-nav pattern).
- **Orphaned entry** (day moved outside the window after a date change) — do
  **not** delete it. Park it in an "Outside trip dates (N)" strip above the
  grid with a one-click "snap to first day." Silent deletion would be
  inventing a decision the owner didn't make.
- **Overlapping entries same day/time** — allowed (e.g. a flexible "explore"
  under a booked block). Lay them side-by-side at half column width, booked
  kind always front-most.
- **Long title** — clamp to 2 lines in the block, full text in popover; never
  truncate the confirmation code.
- **Cost without currency** — assume `EUR`? No — leave currency required in
  the form; an entry can have a cost only if currency is set (the
  never-invent rule applies to money too).
- **Loading** — while `!hydrated`, skeleton gutter + 3 ghost columns (reuse
  `WorkspaceLoading` tone), not a spinner.
- **Error** (write fails) — `PlannerProvider`'s debounce-write owns retry;
  surface a non-blocking "couldn't save — retrying" toast, keep the optimistic
  UI. Never lose the entry the user just typed.

---

## Animation / motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Entry block | drag start | lift (translateY -1px + shadow), as `.trip-pl-bar.is-dragging` | 120ms | ease-out |
| Entry block | commit (pointerup) | settle to snapped position | 140ms | ease-out |
| Cash/Bookings drawer | open/close | height + opacity slide-down | 180ms | ease-in-out |
| Legend filter | toggle | non-matching entries fade to 35% | 160ms | ease |
| Empty slot | hover | fill fade-in | 90ms | ease |

Respect `prefers-reduced-motion`: drop the lift/settle transforms, keep
instant position commits.

---

## Accessibility

- **Grid semantics** — `role="grid"`, day headers `role="columnheader"`, time
  gutter cells `role="rowheader"`. Each entry block is a `button` opening its
  editor.
- **Keyboard** — Tab order: legend → Cash chip → Bookings chip → entries in
  reading order (day, then time). Arrow keys move a focused entry by one slot
  (←/→ = day, ↑/↓ = 30 min); Shift+↑/↓ resizes. Enter opens editor; Delete
  removes (with undo toast).
- **ARIA labels** — each entry announces "`title`, `kind`, `weekday date`,
  `start`–`end`, `prepaid?`, `cash-only?`." Glyph-only badges (🔒 € ⚑) carry
  `aria-label`, never meaning-by-color-alone — the kind is always in the
  text, satisfying WCAG 1.4.1.
- **Focus** — `:focus-visible` 2px accent outline is already global; entries
  and slots inherit it.
- **Screen-reader summary** — an off-screen live region states "Trip:
  `city`, `n` days, `m` entries, `€x` cash needed, `k` bookings" so the
  rollups aren't sight-only.

---

## Build sequence (when it's greenlit)

1. **Data first** — schema + migration + `city-row` round-trip + `mapPatch`;
   seed the real Slovenia itinerary from `Slovenia.xlsx` into Bled/Piran's
   rows via a one-off script (data is *real*, transcribed from the artifact —
   not invented), so the grid renders against a true trip on day one.
2. **Read-only grid** — `TripItinerary` + `ItineraryGrid` + `ItineraryEntry`
   rendering the seed. No editing. Prove the layout against a dense real day.
3. **Editing** — `EntryPopover` create/edit/delete; drag-move + drag-resize
   reusing the calendar's pointer model.
4. **Rollups** — Cash drawer + Bookings ledger + Kind legend/filter.
5. **Phone agenda** view swap.
6. **A11y pass** — keyboard nav, live region, contrast verification on the
   six new kind colors.

Each step is a commit (+ this doc's status line updated, + a feature-doc
follow-up section once issues exist), per the project's incremental-ship rule.

## Open questions (decide before build)

- **Where exactly on `/cities/<slug>/plan`** — a new tab alongside the
  lodging/flight prose, or a section stacked below it? (Leaning: a "Itinerary"
  sub-tab, since the grid wants full width.)
- **Per-entry currency** — the source trip is all EUR; US trips are USD. Cost
  carries `currency` per entry (correct), but the Cash tally groups by it —
  confirm that's the desired display vs. a single trip-currency.
- **Templates** — Janice's grid has recurring shapes (breakfast block,
  check-in/out). Out of scope for v1; note as a future "duplicate day / save
  block" affordance.
