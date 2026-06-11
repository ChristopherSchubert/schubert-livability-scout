# Trip-planning walkthrough — full-review guide

> State doc for reviewing the end-to-end trip-planning flow. The artifact:
> **/mockups/trip-walkthrough.html** (serve with `npm run dev`, port 3000;
> ← → arrows, dots clickable). 37 slides, each = dark context band
> (commentary + "She does: <action>") over a real page mockup. All data is
> the real Slovenia trip; example trips are Slovenia / Silverthorne /
> New River Gorge. **No Cocoa/pet references — removed at owner request.**

## The rules every slide must satisfy (accumulated from owner review)

1. **Click-path** — each slide reachable via the previous slide's named
   control; asides/rewinds labeled as such (e.g. "(rewind · pre-trip)").
2. **Mechanism before result** — editors/sheets precede the states they
   create (composer→trip; transport editor→locked edges; search→strip;
   ✂ split→slot; stay editor→hardened bars; entry editor→pinned lunch;
   fork composer→variations overview).
3. **Provenance / collection rule** — every pool/strip/bucket shows its
   source + entry path; per-item ✎/✕; exactly three ways into a bucket
   (Save / add-your-own / booked-and-dated places itself).
4. **Constant anatomy** — Plan tab = Window(calendar strip) · Transport ·
   Stays · per-city sections; sections never materialize or vanish — they
   fold (▾ expanded / ▸ collapsed bar with count), and folding is a named
   user action.
5. **State persistence** — controls/sections persist across consecutive
   slides of one page unless the state change explains the difference;
   sheet backdrops show the full predecessor page, dimmed.
6. **Conservation** — counts survive transformations (5 search results =
   5 strip candidates; 9 bucket items = 8 dealt + 1 alternate; trays
   reflect placement).
7. **Commentary split** — meta voice only in the dark band; pages carry
   app-real text (state chips, drag feedback, warnings are app-real).
8. **Gesture honesty** — drag = placement; values via editors; no narrated
   gesture the controls can't perform.
9. **Story-truth chrome** — Book badge progression (none → ⏰1 at first
   deadline → ⏰2 with the caves errand → ⏰1 after Postojna books); day-rail
   fill dots match what the story actually filled.

## Slide map (37)

WHERE 1 idea · 2 composer · 3 chip picker · 4 create · 5 skeleton (calendar
strip: weekday/date ticks, weekends tinted, dimmed days beyond the window) ·
6 ✎ dates popover · 7 cities land · 8 ＋ other city · 9 trading nights
(test-and-release) · 10 transport editor · 11 flights lock edges ·
12 locked-not-frozen (Kranj test + undo) — STAYS 13 🔍 search (folds
Transport; shortlists 5) · 14 drop Union · 15 other cities · 16 ✂ split ·
17 splurge night (Hiša Franko) · 18 stay editor · 19 booking hardens —
GATHER 20 window-as-nav → empty bucket · 21 suggestions + saves ·
22 add-your-own (balloon; dated→places itself) · 23 ✎/✕ + undo · 24 manual
pin (Rustika) · 25 keep-it-light + caves errand — LAY OUT 26 the deal
(alternates residue) · 27 human takes the wheel (auto pauses) — CLOCK
28 solve day · 29 entry editor · 30 pinned result · 31 over-pack honesty —
GO 32 book page · 33 mark booked · 34 grid (leg-paged: Ljubljana/Bled/Piran
pages, legend, auto-timed drive connectors, times/locks/cash/pins; Bled leg
shown in full) · 35 phone (full day-of screen) — WHAT IF (rewind) 36 fork
composer · 37 variations (active option A shown inline, tabs, compare
control) · 38 compare side by side (A vs B two columns, differences
highlighted, make-active) — 39 mobile gallery (aside): Plan / Book / Grid
as phone frames, same data one column.

## Janice's feedback widget (deck chrome, not part of the app mockup)

Floating **💬 Feedback** button bottom-right (pulse ring + "spot something?
tell Chris →" nudge until first use). Opens a small draggable panel (grab
the dark header) — write a note, **Save feedback**. Each note **submits to
Chris**: POST `/api/walkthrough-feedback` → Supabase `walkthrough_feedback`
(migration 0015; RLS = anon insert / authed read). The deck tries
same-origin first, then the production URL (covers the local static
preview); failures keep the note in `localStorage` (`tw-feedback-v1`)
flagged unsent and retry on panel-open and page-load — status line says
"Sent to Chris ✓" vs "Saved here — will retry", tally shows pending count.
Slides with notes get a ringed dot in the nav; per-note ✕ removes locally
(a sent note is already submitted). The panel lists **all** notes (every
slide), each with a numbered jump-chip that navigates to its slide; the
current slide's notes are highlighted. When notes exist, the panel
**auto-opens on load** and stays open across slides. **📋 Copy all**
remains as the manual backup. Arrow keys are suppressed while typing;
Esc closes the panel.
Read back the notes with the authed app user or via the pg/Keychain
script pattern (`scripts/.col.mjs`).

## 2026-06-10 four-review pass (navigation · controls · IA · UX)

Run at the owner's request; all 37 slides. Found & fixed: (1) `.sheet
input{width:100%}` stretched checkboxes/radios, wrecking slides 29/36's
right pane — exempted + label styling scoped; (2) slide 29's backdrop day
had 3 of slide 28's 8 rows — full solved day restored; (3) slides 36/37
lacked the trip window (anatomy rule) — added with the May 21–24 range
marked selected (36) / forked A/B (37); (4) slides 14/15/17 rendered the
collapsed Transport bar above the window — canonical order restored;
(5) "＋ add your own stay" label variant unified to "＋ add your own…";
(6) slide-change fade caused a flash (dark band animating + deep dip) —
now stage-only, .85→1, 120ms. Verified clean: did-line controls exist on
their slides; mechanism trails (Lay out 21→26, Solve 27→28, mark-booked
32→33); tab states; topbar; styled control vocabulary; honest refusal +
empty states (31); grid pagination honesty (34).

## 2026-06-10 navigation-expert pass (wayfinding · breadcrumbs · hierarchy)

The hierarchy is Atlas → Trips → <trip> → (Plan | Shelf | Days | Book |
Grid). Fixes: (1) every tripbar now opens with a **Trips ›** crumb — the
path up is always visible; (2) the Book and Grid pages keep the **constant
tripbar** (crumb · trip name · tabs · Book/Grid chips) with the current
page's chip in an active state, replacing the old "← Days" journey-coded
header — structure never changes, the active state moves; their old header
meta became in-page titles; (3) badge stays truthful on those pages (⏰2
on Book, ⏰1 on Grid after Postojna books). Verified holding: topbar
active state (Trips), within-Plan focus = the window's outlined segment
(persists 20–27, Bled→Piran), Days view breadcrumb = day-rail + "city ·
solved" subhead, phone view carries trip · day-N-of-M. **App renamed:
Livability Scout → Schubert Atlas** across all mockups.

## Stable chrome (the "Plan|Shelf|Days jumps around" fix)

Two motions compounded: (1) the context band's height varied with caption/
did length (up to ~40px), bouncing the whole stage vertically every slide —
#caption now reserves 3 lines (min-height 4.2em) and #didline 2 (2.7em),
so the band is constant-height; (2) the segmented control sat in flow after
variable-width trip meta text — it's now absolutely centered in the tripbar,
same x on every slide. Feedback pipeline is LIVE: migration 0015 applied
2026-06-10, prod POST → row verified end-to-end, test rows removed.

## Rule 10 — stable chrome (no arbitrary slide-to-slide variation)

Chrome changes ONLY when the story changes it, in one consistent format.
Canonical forms: trip-meta = "May 15–25 · provisional" (slides 5-10, until
the flights lock) then "May 15–25 · 10 nights" (11+, including the
variation slides — status crumbs like "3 stays"/"all stays booked" belong
to page sections, not the trip bar); window header = "The window" + ✎
adjust dates on the full-window editor (5-12), plain "The window" label on
every miniwin (13-27, 36-37); miniwin legs = identical plain
Ljubljana/Bled/Piran (focus outline only when a city section is focused,
20-27; selection/fork labels only on 36-37); the city tray exists only on
the full-window editor (7-12, where Kranj waits); the Days rail is the
identical full 11-day rail on all Days slides (28-31); the ✂ split-a-stay
control persists on every stays-bearing slide (14-19, highlighted while
its popover is open on 16); stay bars always carry night counts until
booking replaces them with terms (19). Also fixed under this rule: slide
15 had leaked the post-split five-bar state ("nothing split yet" caption
over a split page) — restored to three bars, 2/4/4.

### Addendum (same day): the trip bar is now ONE string

The "provisional" qualifier wasn't earning its place (the soft-dates story
already lives in the unlocked edges, the ✎ popover's "slide it anytime",
and the captions) — trip-meta is now the single constant
"May 15–25 · 10 nights" on every slide. And the slide-13 search sheet got
its missing click-path origin: from the moment cities land (slide 7),
every empty stay slot reads "drop a hotel on <city> · 🔍 search" — slide
13 is just Ljubljana's slot pressed, sheet scoped to that leg. Stays
never "opens" (it was never closed); did-line and caption rewritten.

## Rule 11 — section continuity (the section auditor)

Every page-level section on slide N is either present on slide N+1,
disappears because of an explicit named action, or appears because of one.
The auditor (`scripts/.audit-walkthrough-sections.py`) prints the
section-level diff for every consecutive pair; match each ± line against
the pair's did-lines/captions — an unmatched line is a violation. Run it
after ANY deck edit. The 2026-06-10 run found and fixed: 22/23's sheet
backdrops had collapsed to a stub page (so slide 24 looked like a whole
new section appearing — the owner's catch); 29 and 33 backdrops dropped
the Shelf tray / the Booked·Cash·Passes sections; slide 3's composer lost
its nights field, ＋traveler/＋pet row, and Create-trip footer; ＋ New trip
vanished behind the composer (2-4); slide 27 dropped the proposal's
✓ keep/↶ undo controls; the bucket toolrow existed only on some bucket
slides; city-section titles flapped; unnamed transitions got named (Done
closes the dates popover and entry editor; the suggestions tray closes
via ✕; the big calendar "compacts to a strip" at 13; ✂ split-a-stay is
ghosted until stays exist). Header margin styles normalized so spacing
stops shifting between slides.

## Tour cursor (deck chrome)

Every slide with a named action shows a glowing pointer on its control —
warm halo + repeating click-ring for presses, an oscillating ↔ cursor for
edge/handle drags, and a traveling cursor along a dashed trail for
drag-and-drops (tray→window, strip→bar, bucket→day, shelf→day). Spec
lives in the TCUR array (one entry per slide; null = no action shown,
e.g. result-only slides); targets resolve by text/selector against the
rendered stage and fail silent. Honors prefers-reduced-motion.

## Grid + variations build-out (2026-06-10)

The grid (34) and fork (36–37) were stubs; both fleshed to deck standard.
Grid: leg-paged like print ("one leg per page" → Ljubljana/Bled/Piran page
tabs, page 2 of 3), a category legend, the Bled leg rendered in full across
4 day-columns with real data, auto-timed drive connectors (dashed → blocks:
"→ launch · 4 min" from the solved Tue 19), time labels, and 🔒/💶/📌
markers — blocks positioned to the time gutter (6a = gbody 52,
16.67px/hr). Variations: 37 now shows the active Option A inline (Piran 3n,
4-day strip, Venice catamaran) with A/B tabs and a REAL "compare side by
side" control (was ghosted); new slide 38 is the side-by-side payoff — two
columns (A all-in Piran / B Trieste·Piran·Rovinj), aligned rows with the
genuine differences amber-highlighted, per-column make-active, decide-by
May 19, and the honest post-trip note (they'd cancel Piran for Trieste and
regret it). Deck is 39 slides. Note: keep new markup in the deck's literal-
char convention (▸ · → 🔒), not HTML entities — the section auditor's
continuity check compares text and entities read as false changes.

## Press / result splits + voice (2026-06-10)

The tour cursor exposed slides that showed a trigger button AND its own
popup at once with the cursor on the (covered) trigger — press and result
conflated. Split each into two beats: slide 6 "press ✎ adjust dates"
(cursor on button, no popover) → 7 "the date fields" (popover, cursor on
Done); and "press ＋ other city" (cursor on button, no dropdown) → "search
a city" (dropdown with Trieste, cursor on the result). Deck is now 41
slides — renumbered. (Drags are exempt: a cursor resting at a drag
destination near a popup is fine because the dashed trail shows motion.)

Voice: the deck narrates the reviewer in second person — "She does:" → "You",
all did-lines and captions converted. Janice is the reviewer, not an in-app
character (she remains a trip traveler in the composer rows, which is real
data). Mobile slides (35 day-of, 39 gallery) are iPhone-15 frames; empty
stay slots carry an obvious "🔍 Search hotels" button; card ✎/✕ are 20px
bordered buttons.

## Mechanical checks (run before any review handoff)

Per-slide matrix script (in git history, commit 771384e): topbar/tripbar
presence, Book-badge value, window/anatomy flags; plus: sections-inside-
container, script-after-last-section, captions = sections = She-does lines.

## Known-open items (deliberate, not bugs)

- Print output, "compare side by side" (variations), live flight-status —
  labeled future. trip-jimthorpe.html unlinked, pending owner decision.
- Standalone mockups (workspace/shelf/grid pages) predate several deck
  rules — deck is canonical; owner said don't propagate yet.
- Specs: trip-planner-{components,systems,ux}.md + critique + research
  synthesis. Engines real: lib/solve.js · lib/sourcing.js · lib/trip.js
  (Supabase `trips` row = real Slovenia data).
