# Trip planner — UX architecture (journeys · flows · IA · navigation)

> The layer the design stack skipped (caught by the owner, 2026-06-10): the
> research, components, systems, and mockups all existed, but nothing defined
> the **mental model** — what screens exist, how you move between them, how you
> always know where you are. The mockups were review documents formatted as
> endless scrolls; this doc is the spec the *next* mockups and the real UI must
> obey. Companion to [trip-planner-components.md](trip-planner-components.md)
> (what things look like) and [trip-planner-systems.md](trip-planner-systems.md)
> (what the engines do).

---

## 1. The mental model (one paragraph, the whole thing)

**A Trip is a workspace you return to over months.** It has two halves you
toggle between, matching how planning actually alternates: **the Shelf** (what
we *might* do — the Stay shortlist and the Do pool) and **the Days** (what we
*will* do — the calendar of the trip). Planning is moving things from the Shelf
onto the Days, at increasing time-fidelity, until the machine can Solve each
day into the grid. You are always in exactly one place: *one trip → one half →
(if Days) one day.* That triple is the entire address space, and the chrome
shows it at all times.

Why "Shelf / Days" and not "Gather → Block → Solve" as navigation: G→B→S is a
*process truth*, not a *place*. Janice doesn't finish Gathering then enter
Blocking — she bounces (finds a restaurant while blocking; books a tour while
solving). Phases describe the trip's *maturity*; the nav must describe
*location*. The phase lives in the chrome as a status, not as rooms you're
locked into.

---

## 2. Information architecture — where it lives, what screens exist

```
TopBar (existing app modes)            ── add one mode: "Trips"
└── /trips                             ── Trip list: one card per trip
    └── /trips/<id>                    ── THE TRIP WORKSPACE (one screen, two halves)
        ├── ?view=shelf                ── the Shelf: Stay shortlist + Do pool
        ├── ?view=days&day=2026-05-19  ── the Days: one day at a time
        ├── /trips/<id>/book           ── Reservations: ledger + cash + book-by alerts
        └── /trips/<id>/grid           ── The Grid: the full solved trip, print-ready
```

- **`/trips`** joins the TopBar as a first-class mode (alongside board /
  planning / planned …). City pages get a "+ Add to trip" affordance — the
  bridge from the existing app into a trip's Shelf.
- **The workspace is ONE screen with persistent chrome**, not a scroll
  document. The two halves swap in the content area; the chrome never moves.
- **Book and Grid are sub-pages**, not modes — you visit them for a purpose
  (check deadlines; read/print the final artifact) and come back.

## 3. The navigation model — how you always know where you are

Persistent chrome on every trip screen, top to bottom:

```
┌──────────────────────────────────────────────────────────────────────┐
│ TopBar (app nav — Trips highlighted)                                 │
├──────────────────────────────────────────────────────────────────────┤
│ TRIP BAR   Slovenia · May 15–25 · 10 nights      [Book ⏰2] [Grid]    │
│            [ Shelf ]  [ Days ]                ← the two halves        │
├──────────────────────────────────────────────────────────────────────┤
│ DAY RAIL (Days view only — sticky)                                    │
│  Ljubljana      Bled                     Piran                        │
│  [15][16]  [17][18][●19][20]  [21][22][23][24][25]                    │
│  grouped by leg · today-marker · fill-state dots per day              │
├──────────────────────────────────────────────────────────────────────┤
│ CONTENT (the only thing that scrolls)                                 │
└──────────────────────────────────────────────────────────────────────┘
```

The wayfinding rules:

1. **The Trip bar answers "which trip, which half."** Always visible. The
   Book chip carries a live badge (⏰2 = two deadlines approaching) so booking
   pressure is ambient, not buried.
2. **The Day rail answers "which day, and what's around it."** Sticky, grouped
   by leg with the leg name above the chips. Each chip carries a **fill-state**
   (empty / has anchors / solved ✓ / flagged ⚠) so the rail doubles as a
   trip-wide progress map — you can see "May 22 is still empty" without going
   there. Click = jump. ←/→ arrows page between days.
3. **One day at a time in Days view.** No infinite scroll through eleven days;
   the rail is the overview, the canvas is the focus. (The full-trip view is
   the Grid sub-page — that's its job.)
4. **Shelf and Days are peers, one keystroke/tap apart**, because the core
   gesture — drag a candidate onto a day — needs both. Desktop: Shelf open in
   Days view as a collapsible side tray (the drag source), so the "drag from
   pool to day" interaction is physically possible. Mobile: the tray becomes a
   bottom sheet.
5. **Within a day**, the canvas is short enough not to need its own nav
   (one day ≈ one viewport); time-of-day groups (Morning/Afternoon/Evening)
   are the only internal landmarks.

## 4. User journeys (timeline-anchored — how the workspace is actually visited)

| # | When | Janice's goal | Where she lands | Leaves when |
|---|---|---|---|---|
| J1 | Months out | "We're doing Slovenia in May" | `/trips` → create → legs + dates → workspace, Shelf | trip exists, 2–3 stays shortlisted |
| J2 | 4–6 mo out | Book lodging before it sells out | Shelf (Stay) → book → `/book` confirms | every leg has a booked stay |
| J3 | Weeks out | Fill the pool, place the big rocks | Shelf (Do pool) ⇄ Days (drag to buckets) | each day has its anchors |
| J4 | Days out | Make every day feasible | Days → Solve each day → fix flags → `/grid` review | grid reads clean; cash + ledger checked |
| J5 | **On the trip** | "What's next, where, what's the code" | Phone → today's day (auto-landed) | the trip ends |
| J6 | After | "Would we go back?" | existing post-visit surface (out of scope here) | — |

The same workspace serves all of them; only the *half* and the *fidelity*
change. This is why phases must not be rooms: J3 lives in both halves at once.

## 5. Task flows (the eight that matter)

**F1 · Create a trip** — `/trips` → "New trip" → name + add legs (city picker
from existing cities; a leg = city + arrive/depart) → workspace opens on Shelf.
*Edge: unknown dates → allow dateless creation; Days view shows "set dates"
empty state (the calendar can't render without them).*

**F2 · Shortlist & book a stay** — Shelf (Stay tab) → sourced candidates +
"add your own" → compare cards (price/location/pet policy) → shortlist ★ →
"Booked it" → modal captures confirmation, check-in/out, cancellation, cost →
stay pins to the leg; reservation appears in `/book`. *Edge: external booking
happens on Booking.com etc. — the tool records, never transacts.*

**F3 · Fill the Do pool** — Shelf (Do tab) → sourced pool, filterable by
category + markers (🐾-only) → "+ Save" pulls a candidate to the trip's own
list → "Add your own" for things sourcing can't know (the balloon company) →
each saved item gets duration estimate + optional fixed time/booking. *Edge:
marker unverified → show "Not verified yet"; offer per-place verify (1 API
call) rather than bulk.*

**F4 · Block a day** — Days view, tray open → drag saved item onto
Morning/Afternoon/Evening bucket → it becomes an anchor (fuzzy time) → day
chip in the rail gains its fill-dot. **Capacity hint lives here**: the bucket
header shows rough load ("~6h of anchors + ~1h travel"), warning *before*
Solve ever runs. *Edge: drag to the wrong day → drag the card between days or
back to the tray (un-block).*

**F5 · Solve a day** — Days view → "Solve this day" → engine returns the
timed plan inline (machine rows visually distinct) + feasibility verdict →
accept, or adjust. *Edge: over-packed → flag names the casualties; offer
"move to another day" (one-tap re-block) for the unplaced anchor.*

**F6 · Adjust after solve** — drag a solved entry to a new time → it becomes
**pinned** (badge) → "Re-solve" reflows everything else around pins. Undo
restores the pre-solve state. *Edge: pin conflicts with a fixed booking →
Solve refuses with the conflict named, never silently overrides.*

**F7 · Pre-departure check** — `/book`: ledger sorted by book-by/cancel-by
(lodging first), cash-needed card, missing-confirmation warnings. The ⏰ badge
on the Trip bar is this page's ambient summary. *Edge: deadline passed →
row goes warn-tinted, never auto-deleted.*

**F8 · Day-of (phone)** — open the trip on the trip's dates → lands directly
on **today** in Days view, agenda layout, next-up entry emphasized → tap an
entry = place, directions link, confirmation code, contact. Tomorrow is one
rail-tap away. *Edge: offline-ish — the day must render from cached data; the
codes are the thing she actually needs at the trailhead.*

## 5.5 The editing model (added 2026-06-10 — the flows assumed it, nothing defined it)

**Everything is editable where you see it.** Any entry, on any surface, opens
the same `EntryEditor` sheet: workspace rows (click), grid popover ("Edit →"),
tray cards (duration/markers before placing). One editor, every door.

- **Edit ↔ Solve contract:** editing a solved entry's time **auto-pins** it
  (📌); Re-solve reflows everything *around* pins. Any edit marks the day
  "edited since solve" — the Re-solve button carries a dot until re-run.
- **Three exits, distinct meanings:** *Back to Shelf* un-blocks (returns to
  the pool, keeps all data) · *Move to day…* re-blocks elsewhere at fuzzy
  time · *Delete* removes with an undo toast — never silently.
- **Machine rows** (travel/buffer/free) aren't edited directly — they're
  consequences. Adjusting them = pinning neighbors and re-solving; tapping
  one offers "adjust the anchors around this."

### The editor's control model (2026-06-10 — after "Save/Pin/Delete/Shelf is
### missing UX rationality"; it was — four controls from three categories
### posing as peers)

Every control must be exactly one of four things, and each gets its own home:

| Class | Control | Home | Rationale |
|---|---|---|---|
| **Field** | all inputs | the form, **autosaved** (debounced) | matches the app-wide PlannerProvider convention; no Save/Cancel pair, no draft state. Footer shows a quiet "Saved ✓" status; the only exit is **Done** (and ×/Esc, which mean the same thing — nothing is ever lost). |
| **Property** | 📌 *Hold at this time* | a toggle **beside the time fields** | pinned is state, like prepaid — not an exit action. Auto-checks when a solved entry's time is edited. |
| **Lifecycle move** | *Move to…* (another day · the Shelf) | one select/menu | the same transition family — re-block elsewhere or un-block entirely. Never deletes data. |
| **Destruction** | *Delete* | alone, visually separated, always with undo | the only irreversible-feeling act gets isolation + a safety net. |

**Context-sensitivity:** machine rows open a read-only summary — no move, no
delete, no pin (you can't shelve a travel leg; it's a consequence). Their one
affordance: "adjust the anchors around this." Past days: fields editable
(notes!), moves disabled.

## 5.7 The zhuzh model (owner sessions, 2026-06-10)

Planning is **one grammar at five altitudes** — *gather options → machine
proposes → you zhuzh it → booking hardens it* — over Trip → Cities → Nights →
Days → Hours. Key rules, all owner-confirmed:

- **The skeleton is sculpted, not input.** A trip starts as WHERE + a soft
  window ("Slovenia, ~10 days"). Cities are bars dragged within the window
  (boundary drag = zero-sum night trade between neighbors; outer-edge drag =
  trip grows/shrinks). Stays are bars *under* a leg — a leg holds a
  **sequence** of stays (Toplice ×3 + Hiša Franko ×1), trimmable by edge-drag.
- **Commitment hardens the clay.** `toBook` bars slide freely; `reserved`
  tugs; `booked` resists and surfaces its cancellation terms when moved;
  booked flights freeze the trip's outer edges.
- **Buckets per city; Distribute ("lay out") per leg, human-triggered.**
  The bucket shows a readiness signal (gathered hours vs. open days). "Lay
  out Bled" deals the cards: booked dates pin, one heavy anchor/day,
  closed-days respected, load balanced. **Leftovers stay in the bucket as
  alternates** — the Gettysburg "Alternate Activities" list is exactly this
  residue. Never silently dropped.
- **Human ↔ auto handoff:** any manual edit pauses auto for that scope
  ("edited — layout paused") until an explicit re-trigger ("re-lay out around
  my pins"). Pinning is the cheapest gesture — dragging or editing IS
  pinning. Manual day-assignment is allowed at any stage.
- **Keep-it-light** is a day property Distribute must respect (≤ one light
  item).
- **Variations (step 2, designed not built):** a fork scoped to a date range;
  each option holds its own skeleton/stays/buckets; exactly one active for
  rollups; the fork's **decide-by date inherits from the cancellation
  deadlines** of the bookings inside it (the Trieste/Piran lesson — both
  futures stay alive while they're refundable).

**The walkthrough** ([/mockups/trip-walkthrough.html](../public/mockups/trip-walkthrough.html))
plays this entire model as a 20-step arrow-through deck on the real Slovenia
trip — the Janice-review artifact.

### Two standing rules (owner audit, 2026-06-10)

- **The collection rule.** Every pool / bucket / candidate strip / tray must
  show: (a) **its source** ("from the places cache near the stay", "added by
  hand"); (b) **its entry path** as a visible control (＋ Save / 🔍 search /
  ＋ add your own); (c) **per-item lifecycle** — ✎ edit and ✕ remove on every
  card. Collections never just *have* contents.
- **The commentary-split rule.** In any walkthrough/demo artifact, meta
  commentary lives ONLY in the context band; the page below renders ONLY what
  the app would. The line: drag *feedback* ("Bled +1 · Piran −1"), state
  chips ("provisional", "proposal", "auto-layout paused"), and real warnings
  ("free cancellation ends May 12") belong to the app; narration ("just
  dropped", "placed itself", "drag ↔ to trade nights") does not.
- **The state-persistence rule.** Across consecutive renderings of the same
  page, a control disappears ONLY when the state change explains it (the tray
  empties because its item was placed; "Lay out" becomes keep/undo while a
  proposal is pending; a dropzone fills). Cropping a page "for focus" is a
  continuity bug, not a presentation choice.
- **The constant-anatomy rule.** A page's section skeleton is fixed — on the
  Plan tab: Window · Transport · Stays · per-city sections. Sections render
  their empty states (with their entry controls) from the first moment;
  they never materialize once populated. An empty state teaches the page.
- **The gesture-honesty rule.** Never narrate a gesture the rendered controls
  can't perform. Time changes in the **list** view go through the editor
  (✎ → time fields); drag-to-retime exists only where a time axis is drawn
  (the grid view). Drag is for *placement* (pool→day, day→day); the editor is
  for *values*.


### Pool vs. bucket, locks, and splits (owner control-census, 2026-06-10)

- **Pool ≠ bucket.** The *pool* is suggestions — Google-cache candidates near
  the leg's stay, browsable, not part of the trip. The *bucket* is the trip's
  saved want-list per city. Exactly three ways in: ① **＋ Save** from a
  suggestion · ② **＋ add your own** (item editor) · ③ booked-and-dated items
  skip the bucket and **place themselves**. The bucket's jump control is
  "Browse suggestions →" (opens the Shelf scoped to the city) — there is no
  fourth path.
- **Reaching a bucket: the window is the navigation.** Click a city segment →
  the Plan page focuses that city's section (stays · days · bucket).
- **Locked ≠ frozen.** Booked flights lock only the trip's outer edges.
  Inside: add/remove/reorder cities and trade nights freely. Every lock's
  tooltip names its cause and its exit ("set by your return flight — change
  the flight to move this"); hardening is reversible at the price of the
  thing that caused it.
- **Splitting a stay** asks one question — *after which night?* — and leaves
  an honest open slot ("night of May 20 — drop a stay"), never silently
  stretching a neighbor.

## 6. What this forces on the mockups (the fix list)

1. **Re-frame mockup 2 as the workspace**: Trip bar + Day rail + one day
   canvas + Shelf tray — not a scrolling narrative. The G→B→S story becomes a
   *demo sequence through the chrome* (Shelf → drag → Solve on one screen),
   which is also exactly the missing Block→Grid climax shot.
2. **Mockup 1 becomes `/grid`** — the print-ready final artifact reached from
   the Trip bar, rendered from engine output, cross-leg days honest.
3. Every screen shows the chrome; nothing relies on scroll position for
   orientation.

## 7. Open questions
- Does "Trips" deserve a TopBar slot now, or hang off Visit/Planning until the
  UI proves itself? (Lean: TopBar slot — it's a first-class object.)
- Day rail on mobile: chips compress to dots? swipe-only with a day-picker?
- Print/share of `/grid` (Janice's artifact was shareable by nature) — v1 or
  later?
