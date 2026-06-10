# Trip planner — component system (design-system spec, for review before building)

> Status: **proposal — do not build yet.** Supersedes the single-format
> hour-grid in [trip-itinerary.md](trip-itinerary.md). Produced with the
> `design-system` skill (audit → extend), grounded in five real trip artifacts
> (Slovenia, New River Gorge, Gettysburg, Silverthorne, Jim Thorpe) **and** in
> Livability Scout's existing tokens/components — so this *extends* the system
> rather than inventing beside it.

## Decisions locked (2026-06-09 review)

1. **Scope: full system** — build all phases (Gather → Block → Solve → Frame),
   not a thin slice. Sequenced (you can't Solve without inputs) but the whole
   thing is the target.
2. **A real `Trip` entity** — a Trip groups cities + days + entries as one
   object (Slovenia = Ljubljana + Bled + Piran under one Trip). Supersedes the
   per-city `itinerary` column as the primary model; the column becomes a
   migration source. Makes "shift to next year" and multi-city trips first-class.
3. **Marker taxonomy: independent + extensible.** Markers are **decoupled** —
   each is its own flag, any combination, never bundled — and each can carry a
   cited `source`. Locked starting set (open to additions):
   - *Attributes:* `dog` 🐾 · `veg` 🥦 · `kid` 🧒 · `patio` ☂️ · `accessible` ♿
   - *Booking/payment:* `cashOnly` 💶 · `prepaid` 🔒 · `reservation` 📞 · `free` 🎟️
   - *Availability:* `seasonal` 📅 · `closed` ⛔
   Shape: `marker = { type, value?, source? }`. The set is **not closed** — new
   types add without schema change (markers live in jsonb).
4. **Agent-decided defaults:** drag = `@dnd-kit`; map arrives in the Solve phase;
   spacing stays ad-hoc (not tokenized now).

---

## North star — the finished grid is the *output*, generated, not typed

Janice's fully-Solved Slovenia grid is **the destination**: the pre-trip
artifact you actually want in hand before you go. Today she builds that entire
hour-by-hour matrix **by hand** (~100 cells). **That manual labor is exactly
what this tool removes.**

The human does the parts that need judgment — **Gather** the wants, **Block**
the big rocks into rough days. The machine does the tedious part — **Solve**:
order each day, compute the travel legs, slot meals and buffers, fit it to the
clock, and **emit the grid**. The grid view is therefore a *rendered result*,
not a blank canvas you fill cell by cell. Success = Janice never types a grid
again; she approves and tweaks one the tool assembled.

> So **Solve is the product**, not a v2 nice-to-have. Gather + Block exist to
> feed it. The build still proceeds in that order (you can't assemble without
> inputs), but the destination is the auto-generated grid.

---

## 1. Audit — what we're extending

The trip planner is not a greenfield. The existing system already carries most
of the primitives; the discipline here is **reuse before invent.**

### Reuse map (existing → trip-planner role)
| Existing pattern (in `app/*.css`) | Reuse for | Don't rebuild |
|---|---|---|
| `.metric-source` (`<div title={source}>`, used in `ChapterData`) | **marker citations** — the source chip under every cited claim | a new citation primitive |
| `.day-card`, `.day-card-head` | **AgendaView** day section shell | a new day container |
| `.checklist-card`, `.checklist-card-head` | **BookingChecklist** rows | a new checklist |
| chip family (`.axis-chip` w/ `-label`/`-score`, `.filter-pill`, `.delta-chip`, `.felt-chip`, `.decision-chip`) | **MarkerSet**, **TimeChip**, **BookingBadge** | a new chip language |
| `.trip-cal-*` (bands, bar, today rule, scroll shell) | **GridView** (the shipped hour-grid genes) | grid scaffolding |
| `.card` / `.card-spacious`, `.benchmark-pill`, `.climate-legend` | **TripGlanceCard**, **OptionsDirectory**, legends | card/legend shells |

### Token-coverage gaps (what's genuinely missing)
| Category | Status | Gap to fill |
|---|---|---|
| Color — base palette | ✅ defined (`--bg`, `--text`, `--accent`, `--muted`, `--border`, `--panel*`) | — |
| Color — **entry kinds** | ❌ none | 6 kind colors (booked/flexible/travel/meal/checkin/todo) |
| Color — **markers** | ❌ none | marker icon/active treatment (mostly monochrome; see §2) |
| Type | ✅ `--font-display` Fraunces, `--font-ui` Inter Tight | — |
| Radius | ✅ `--radius` 14px (cards) | entry/chip tighter radius (6px) — adopt as `--radius-tight` |
| **Spacing** | ⚠️ ad-hoc rem (clusters at .4/.5/.6/.7/.85/1/1.5) | not blocking; keep the convention, don't tokenize now |
| **Motion** | ⚠️ ad-hoc but consistent (120–160ms ease-out, ~200ms color, 280ms cubic expand) | name 4 motion tokens (§2) so the planner is consistent |

**Audit score for the trip-planner surface as proposed: tokens 6/10 (kinds +
markers + motion to add), component reuse 8/10 (most primitives exist),
documentation 9/10 (this doc).**

---

## 2. Tokens

### Existing (use as-is)
`--bg #fbf6ea` · `--panel #fffdf6` · `--panel-strong #f4eddc` · `--border #d8ccb8`
· `--text #1b1814` · `--muted #6b6358` (AA-safe — do not lighten) · `--accent #0d4c44`
· `--accent-soft #d2e6e1` · `--radius 14px` · `--font-display` Fraunces · `--font-ui` Inter Tight.

### New — entry-kind colors (add to `:root`)
Derived from the existing warm palette, **not invented from scratch**. Booked
anchors the product green; meal/travel reuse the calendar's seasonal-wash hues
so the surface reads as one family. Text must clear **WCAG AA 4.5:1 on `--bg`**
(the same bar that forced the 2026-06-09 `--muted` darkening — *verify, don't
assume*; values below are targeted at ≥4.5 but re-check on implementation).

| Token | Value | Kind | On-`--bg` contrast (target) |
|---|---|---|---|
| `--kind-booked` | `#0d4c44` | Booked | 8.9:1 ✅ |
| `--kind-meal` | `#9a5a16` | Meal | ~5.0:1 ✅ (darkened from the wash amber `#a0601c` to clear AA) |
| `--kind-travel` | `#2e5482` | Travel | ~5.6:1 ✅ |
| `--kind-checkin` | `#665285` | Check-in | ~5.0:1 ✅ (darkened the plum to clear AA) |
| `--kind-todo` | `#7d5e22` | To-do | ~5.4:1 ✅ (ochre) |
| `--kind-flexible` | `var(--muted)` | Flexible | 4.5:1 ✅ |
| `--kind-*-fill` | same hue @ 10–14% alpha | card tints | decorative only |

> **Color is never the sole signal** (WCAG 1.4.1). Every entry shows its kind
> as text/icon too; the color is reinforcement.

### New — marker treatment (mostly monochrome, by design)
Seven markers would become a rainbow if each got a hue. Instead: markers render
as **neutral chips** (`--panel-strong` fill, `--text` label, an icon), with a
state color only where it carries real meaning:

| Marker | Icon | Color treatment |
|---|---|---|
| Dog-friendly | 🐾 | neutral chip |
| Vegetarian | 🥦 | neutral chip |
| Kid-friendly | 🧒 | neutral chip |
| Patio / outdoor | ☂️ | neutral chip |
| Accessible | ♿ | neutral chip |
| Cash-only | 💶 | `--kind-todo` (ochre = "needs action") |
| Prepaid | 🔒 | `--kind-booked` (green = "locked") |

### New — motion tokens (named from observed values)
| Token | Value | Use |
|---|---|---|
| `--motion-fast` | `120ms ease-out` | hover lift, press |
| `--motion-base` | `160ms ease-out` | settle, fades |
| `--motion-color` | `200ms ease` | color/opacity shifts |
| `--motion-expand` | `280ms cubic-bezier(0.4,0,0.2,1)` | collapse/expand (matches the existing accordion) |

Respect `prefers-reduced-motion`: drop transforms, keep instant state changes.

---

## 3. The core decision — one model, three views

The five artifacts differ in **render, not data**. A scheduled thing has a
time, a place, a kind, markers, a booking, a cost, a note — whether drawn as a
grid cell, an agenda row, or a directory card.

```
Trip
├── glance          { destination, dates, nights, driveFrom, diet, travelers[], pets[], theme }
├── preTrip         { limitations[], bookingChecklist[], tips[], sources[] }
├── accommodations  per leg: candidates[] (pre-booking shortlist) + chosen stay   ← the "Stay" track ⭐
├── reservations[]  unified booking spine — lodging + activities, lead-time + cancel-by  ⭐
├── days[] → entries[]                  ← scheduled plan  (GridView | AgendaView)
├── options         { directory[], excursions[], alternates[] }   ← the "Do" pool
└── (derived)       cashNeeded, reservationLedger
```

**Accommodation (per leg) — first-class, researched-then-booked early** (added
after the research synthesis; the artifacts all lead with lodging and book it
*first*). `{ legId, candidates: [ Stay ], chosenId, status }` where a
`Stay = { name, place, priceRange, petPolicy, markers[], rating, source,
booking? }`. Lives in **Gather** (shortlist candidates, filter by pet policy /
price / location) and graduates to a **Reservation** when booked
(check-in/out, confirmation, cancellation policy, parking).

**Reservation (the booking spine).** `{ id, kind: lodging|activity, title,
leadTime?, bookBy?, confirmation?, cancelBy?, prepaid?, cost? }` — one ledger
over lodging *and* activities, deadline-aware. Lodging reservations are the
highest-priority (book 4–6 mo ahead). Supersedes the old `bookingsLedger`.

**Entry atom:** `{ id, day, time, kind, title, note, place, markers[], booking, cost, role }`
— `time` is point | range | fuzzy; each `marker` carries an optional `source`;
`place` carries address + map link + phone; `role` is `anchor | connective`
(see §3.5).

---

## 3.5 Planning is a progression — **Gather → Block → Solve** (the spine)

The owner's model: *"build the list of stuff to do, then slot it into days, then
figure out the logistics that make it work."* This is the organizing spine. The
same `Trip` data deepens through three phases — **time fidelity rises and the
tool does more work as you go.** The five artifacts are snapshots at different
phases (Silverthorne ≈ Gather; Jim Thorpe ≈ Blocked+Solving; Slovenia ≈ Solved).

| Phase | You're doing | Time fidelity | Primary view | Tool does |
|---|---|---|---|---|
| **1 · Gather** | two parallel tracks → **Stay:** shortlist + book lodging *first*; **Do:** brain-dump everything you might do | **none** | `StayShortlist` + `AccommodationCard` · `OptionsDirectory`, `ExcursionRadius`, `AlternatesList` | filter stays by pet policy/price; collect activities w/ markers + duration + location; suggest from city POIs; lead-time alerts |
| **2 · Block** | drag the **big rocks** into days | **fuzzy** ("Sat morning") | `AgendaView` w/ Morning/Afternoon/Evening buckets | warn "day is overstuffed", keep anchors loose |
| **3 · Solve** | *(optional)* make each day actually feasible | **precise** (clock) | `GridView` (tighten) | **auto-insert travel legs** (drive time from the map), flag no-buffer days, **surface free gaps**, total cash/reservations |

> **Two refinements from the research synthesis** ([trip-research-synthesis.md](trip-research-synthesis.md)):
> (a) Gather is **two tracks** — *Stay* (lodging, booked earliest, its own
> research→book lifecycle) runs ahead of *Do* (activities). (b) **Solve is
> optional** — the basecamp archetype (Silverthorne) deliberately stops at loose
> buckets; the agenda is a legitimate *final* form, not only a waypoint to a grid.

### What this introduces to the model
1. **Time fidelity is a first-class progression, not a fixed format.** An entry's
   `time` legitimately moves `none → fuzzy → range → point` as it firms up. This
   is *why* `TimeChip` must render all three — it's not cosmetic, it's the phase
   made visible.
2. **`role: anchor | connective`.** Anchors are the things you came for (the
   balloon, the railway, the Venice catamaran). **Connective** entries — travel,
   rest, meals, buffer, free time — are the logistics woven in during Solve, and
   several are **auto-derived** (a `travel` leg computed between two placed pins;
   a flagged free gap). Anchors are placed by hand; connectives the tool helps
   with.
3. **Feasibility checks belong to Solve.** "This day has 9 hrs of activities and
   2 hrs of driving with no rest" / "you have a free 3–6 PM here" — the tool's
   job is to make an over-packed day *visible*, not to silently allow it. (This
   is the trip-planning analogue of the project's never-fake-it rule: surface the
   gap honestly.)

### How it reshapes the build order (answers open Q1)
Build **by phase**, not by component group — each phase is usable on its own:
- **v1 = Gather + Block.** The pool (`OptionsDirectory`/`AlternatesList`) +
  `AgendaView` with fuzzy time-of-day buckets + drag-from-pool + `EntryCard` +
  `MarkerSet`. Lower-fidelity, immediately useful, matches how a trip *starts*.
- **v2 = Solve.** `GridView` clock-tightening + map + auto travel legs +
  buffer/free-gap flags + `CashNeeded`/`BookingsLedger`.
- **v3 = Frame.** `TripGlanceCard`, `TripLimitations`, `BookingChecklist`,
  `SourcesList` — the polish that makes it read like Jim Thorpe.

(The shipped Slovenia seed is a fully-Solved trip — perfect for building/testing
Solve against real data, even though most *new* trips start at Gather.)

---

## 3.6 Solve — the auto-assembler (the core IP)

Solve turns a set of **blocked anchors** into a **timed grid**. This is the
engine that replaces Janice's manual grid-building.

### Inputs (what Gather + Block must capture so Solve can run)
This is *why* the earlier phases collect what they do — each is a Solve input:

| Input | Captured in | Notes |
|---|---|---|
| Anchor list per day | Block | the big rocks already slotted to a day |
| Duration (est.) | Gather (per option) | "~1.5 hrs"; editable |
| Location (lat/lon) | Gather | from city POIs / `PlaceRef`; needed for travel math |
| **Fixed-time constraint** | Gather/booking | booked tours are *hard*: balloon 05:30, Vintgar check-in 11:00–11:20, catamaran 08:00 |
| Opening hours | Gather (optional) | soft constraint (castle opens 08:00) |
| Time-of-day preference | Block (the bucket) | morning / afternoon / evening |
| Lodging location + check-in | `TripGlanceCard` | the day's start/end pin |
| Meal preferences | Trip-level | when to slot breakfast/lunch/dinner |

### What it computes (the connective tissue, `role: connective`)
1. **Order** the day's anchors — respect fixed times first, then geography
   (minimise backtracking) and opening hours.
2. **Travel legs** between consecutive pins — drive/walk time from routing
   (Leaflet/OSM, or a great-circle estimate as fallback). Inserted as `travel`
   entries.
3. **Meals** at meal-times if a gap allows; **buffers/rest** between heavy items.
4. **Free time** — leftover gaps surfaced explicitly (not hidden).
5. **Clock assignment** → the grid. **Feasibility flag** if it won't fit
   (over-packed day) — surfaced honestly, never silently dropped.

### Hard vs. soft (be honest about the algorithm)
- **Hard constraints:** fixed-time bookings, a day's anchor set. These cannot be
  violated; if they conflict, Solve *says so* rather than guessing.
- **Soft:** ordering, opening hours, meal timing, buffer length — heuristics.
- **v1 Solve is deliberately naive:** greedy by fixed-times-then-geography +
  estimated travel, fully editable after. Not a global optimiser. The point is
  to emit a *good-enough grid Janice tweaks*, not a perfect one she can't touch.
  Smarter routing / opening-hours / multi-day balancing deepen later.

### Output
The timed entries we already model (`itinerary.entries`) — so **GridView renders
the Solve output directly**, and Janice's edits flow back as overrides Solve
respects on re-run (pin an entry → Solve won't move it).

---

## 4. Component specs (extend format)

Grouped. The atoms (4.x) are specced in full; framing/options/rollups (4.y) are
specced to API + variants + states + a11y. "Extends" names the existing pattern
each builds on.

### 4.1 `EntryCard` — the atom
**Problem.** One activity, rendered consistently whether it's a dense grid cell
or a roomy agenda row. **Extends** `.trip-cal-bar` (grid genes) + `.day-card`
(agenda genes).

| Prop | Type | Default | Description |
|---|---|---|---|
| `entry` | Entry | — | the data atom |
| `density` | `compact \| full` | `full` | compact = grid cell; full = agenda row |
| `draggable` | bool | `true` | move/resize affordances |

| Variant | Use when |
|---|---|
| `compact` | GridView — title + time + kind spine + marker icons only |
| `full` | AgendaView — adds note prose, `PlaceRef`, `BookingBadge`, cited `MarkerSet` |

| State | Visual | Behavior |
|---|---|---|
| Default | left color spine = `--kind-*`; fill `--kind-*-fill` | — |
| Hover | lift (`--motion-fast`, the `.trip-cal-bar:hover` shadow) | reveal resize handles + "×" |
| Dragging | raised shadow, `z-index` up | live preview; commit on `pointerup` |
| Booked/prepaid | 🔒 glyph | — |
| Cash-only | 💶 in `--kind-todo` | feeds `CashNeeded` |
| Conflict | hairline collision rule | two entries overlap same time |

**Tokens:** `--kind-*`, `--radius-tight`, `--motion-fast`, `--font-ui`.
**A11y:** `role="button"`; label = "`title`, `kind`, `weekday date`, `time`,
`booked?`, `cash-only?`". Glyphs carry `aria-label`. Kind is always in text
(never color-only).

### 4.2 `TimeChip`
**Problem.** Not every plan has clock-precise times — Jim Thorpe uses ranges
(`2:00–2:30 PM`) and fuzzies (`~12:00`); Gettysburg uses sections (`Morning`).
**Extends** the chip family (`.axis-chip`).

| Variant | Renders | Source artifact |
|---|---|---|
| `point` | `4:00 PM` | Slovenia |
| `range` | `2:00–2:30 PM` | Jim Thorpe |
| `fuzzy` | `~9:45`, `Morning` | Gettysburg |

Tabular figures, `--muted`. A11y: ranges announced "from X to Y"; fuzzy reads
its literal label.

### 4.3 `MarkerSet` — the signature element
**Problem.** Every artifact tags places (dog/veg/kid/patio/cash/prepaid), and
Jim Thorpe **cites a source for every dog-friendly claim**. Markers + sources
are first-class — the trip equivalent of a measured metric with provenance.
**Extends** the chip family + **`.metric-source`** for the citation.

| Prop | Type | Default | Description |
|---|---|---|---|
| `markers` | `Marker[]` | `[]` | `{ kind, value?, source? }` |
| `showSources` | bool | `false` | full density reveals the cited source chip |

| State | Visual | Behavior |
|---|---|---|
| Default | neutral chip + icon + label | — |
| Cited | `.metric-source`-style source under/beside chip (`title=` on hover) | provenance, matches app ethos |
| Uncited | subtle "unverified" dot | honest blank > false confidence |
| Restricted | ❌ tint (e.g. "No pets") | from `StatusMatrix` |

A11y: icon + **text label always** (no color-only meaning). Source announced as
"verified by `source`".

### 4.4 `PlaceRef` / `BookingBadge`
- **`PlaceRef`** — name + address + 📍 map link + phone (one-tap directions).
  Extends nothing; new but trivial. A11y: link labelled "Directions to `name`".
- **`BookingBadge`** — `booked` / `prepaid` / `confirmation: <code>` /
  `cancel by <date>` (countdown). Extends `.bkbadge` / `.decide-meta-pill`.
  Never truncate a confirmation code.

### 4.5 Views — `DayPlan`, `GridView`, `AgendaView`
| Component | Extends | Key states |
|---|---|---|
| `DayPlan` | new container | owns view-mode toggle (grid ⇄ agenda), day nav; empty state → "set trip dates" |
| `GridView` | `.trip-cal-*` | time-gutter × day-columns; horizontal scroll past ~5 days; today rule; loading skeleton |
| `AgendaView` | `.day-card` | day → optional time-of-day groups (Morning/Afternoon/Evening) → `EntryCard density=full`; the narrative default |

**Phone:** GridView is a desk instrument → collapses to AgendaView ≤640px (a
view swap, same data — not a second model).

### 4.6 Trip frame
| Component | Extends | Notes |
|---|---|---|
| `TripGlanceCard` | `.card-spacious` | facts grid: destination, dates, drive-from-home, lodging+check-in, diet, travelers incl. pets, theme, weather |
| `TripLimitations` | `.gate-card` (warning tone) | "read first" cards; severity tint; **each cites source + date** |
| `BookingChecklist` | `.checklist-card` | to-dos w/ done state, lead-time, phone/url, "book by" date |
| `TripTips` | `.card` (collapsible) | practical notes |
| `SourcesList` | `.metric-source` rows | the citation ledger |

### 4.7 Stay track (lodging — booked first) ⭐
| Component | Extends | Notes |
|---|---|---|
| `StayShortlist` | `.city-card` grid | per-leg candidate stays *pre-booking*; filter by **pet policy** / price / location; states: shortlisted / chosen / booked |
| `AccommodationCard` | `.city-card` + `MarkerSet` | one candidate stay: name, `PlaceRef`, price range, pet policy (cited), rating; "book" → graduates to a `Reservation` (check-in/out, confirmation, cancellation policy, parking) |

### 4.8 Do pool + rollups
| Component | Extends | Notes |
|---|---|---|
| `OptionsDirectory` | `.city-card` / `.image-research-card` | candidate activities/dining as attribute cards (rating, hours, meals, price, `MarkerSet`); drag into a day |
| `ExcursionRadius` | `.benchmark-pill` rows | side-trips grouped by drive-time radius (<1 hr, <3 hr) |
| `AlternatesList` | `.day-card` (muted) | backup / rainy-day / parallel options off the timeline |
| `StatusMatrix` | `.climate-legend` / table | activity × attribute → ✅/❌/N-A ("can Cocoa come?") |
| `CashNeeded` | `.benchmark-pill` | cash-only sum by currency |
| `ReservationLedger` | `.checklist-card` | **lodging + activities** in one ledger: lead-time ("book 4–6 mo ahead"), confirmation, cancel-by countdown, soonest first. Lodging rows rank highest. (supersedes the old `BookingsLedger`) |

---

## 5. Composition

```
TripGlanceCard
TripLimitations · BookingChecklist · TripTips          ← collapsible frame
┌─ DayPlan ───────────────────────────────────────────┐
│  [ Grid ⇄ Agenda ]   [Cash €1127▸] [Bookings 4▸]     │
│  GridView | AgendaView  → EntryCard → MarkerSet/Place │
└──────────────────────────────────────────────────────┘
OptionsDirectory · ExcursionRadius · AlternatesList     ← the pool, drag up
SourcesList                                             ← citation ledger
```

---

## 6. Accessibility (system-wide)
- **Color never alone** (1.4.1): kind in text, markers carry icon+label.
- **Contrast** (1.4.3): all 6 kind colors targeted ≥4.5:1 on `--bg`; verify on build.
- **Keyboard**: grid is `role="grid"` with arrow-key entry move/resize; agenda is a list; entries are buttons; Tab order = chrome → days(reading order) → options.
- **Live region**: announces "Trip: `city`, `n` days, `m` entries, `€x` cash, `k` bookings."
- **Motion**: honor `prefers-reduced-motion`.

---

## 7. Open questions for review
1. **v1 scope** — confirm the phase-based order (§3.5): **v1 = Gather + Block**
   (pool + AgendaView fuzzy buckets + EntryCard + MarkerSet), Solve and Frame
   after. Agree, or pull any Solve piece (e.g. the map) forward?
2. **Per-city vs. a `Trip` entity** — trips are multi-city (Slovenia = 3 rows); group cities, or keep stitching per-city itineraries?
3. **Marker taxonomy — lock it:** dog, vegetarian, kid-friendly, patio, accessible, cash-only, prepaid. Add/remove?
4. **Drag** — adopt `@dnd-kit` (accessible, keyboard, touch) vs. extend the hand-rolled `.trip-cal` pointer model? (and retrofit `TripCalendar`?)
5. **Map** (Leaflet on existing OSM tiles) in v1 or later?
6. **Spacing tokens** — leave ad-hoc (current convention) or formalize a scale now while we're adding tokens anyway?
