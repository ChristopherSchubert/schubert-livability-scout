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
GO 32 book page · 33 mark booked · 34 grid · 35 phone — WHAT IF (rewind)
36 fork composer · 37 variations.

## Janice's feedback widget (deck chrome, not part of the app mockup)

Floating **💬 Feedback** button bottom-right (pulse ring + "spot something?
tell Chris →" nudge until first use). Opens a small draggable panel (grab
the dark header) — write a note, **Save feedback**; notes are per-slide,
persist in `localStorage` (`tw-feedback-v1`), survive reload. Slides with
notes get a ringed dot in the nav; the panel lists the current slide's
notes with per-note ✕. **📋 Copy all** puts a plain-text digest on the
clipboard to paste to Chris. Arrow keys are suppressed while typing;
Esc closes the panel.

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
