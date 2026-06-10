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
