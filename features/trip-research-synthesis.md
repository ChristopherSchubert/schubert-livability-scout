# Trip planning — research synthesis (5 real artifacts)

> Method: artifact analysis (the five real trip plans treated as research
> evidence). "Participants" P1–P5 = the artifacts. Observations are separated
> from interpretation. Feeds [trip-planner-components.md](trip-planner-components.md).

**Corpus.** P1 Slovenia.xlsx (booked-heavy hour-grid, fully solved) · P2 New
River Gorge.xlsx (loose hour-grid) · P3 Gettysburg.docx (day-narrative) · P4
Silverthorne.docx (directory + narrative + drive-radius day-trips) · P5 Jim
Thorpe.docx (magazine: glance, limitations, booking checklist, schedules,
dining guide, dog-status matrix, sources). Planners: Janice (primary) & Chris,
+ Cocoa (125 lb Newfoundland) + vegetarian.

## Executive summary
The five plans are **one trip at different fidelities** — directory → loose day
buckets → fully-clocked grid — which validates the Gather → Block → Solve model.
But two findings *refine* it: (1) **lodging is a separate, earlier, higher-stakes
track** that doesn't fit the single-stream progression — it's gathered and
*booked* before activities; (2) **Solve is optional** — some trips deliberately
stop at loose buckets and never want a clocked grid. Everything is **cited**,
and **hard constraints** (dog, veg, fixed-times, closures) drive every decision.

## Key themes

### Theme 1 — Same trip, rising fidelity (validates Gather→Block→Solve)
**Prevalence:** 5/5. **Observation:** P4 is mostly a directory + Morning/After/
Dinner buckets; P3 is bucketed with loose times; P1/P2 are clocked grids; P5
spans all of it. **Interpretation:** fidelity is the spine, not the format. ✅
The model holds.

### Theme 2 — The final grid is hand-built, expensive labor (the core pain)
**Prevalence:** P1, P2. **Observation:** P1 is ~100 hand-typed cells with
manually-computed sequencing; P2 hand-carries addresses per cell. **Interpretation:**
the tedious assembly (ordering, travel time, clock-fitting) is exactly what
should be automated. → **Solve.**

### Theme 3 — Lodging is the first booking, with its own research→book lifecycle ⭐
**Prevalence:** 5/5. **Observation:** P5 "BEFORE YOU GO": *"VRBO/Airbnb — filter
'pets allowed,' message hosts to confirm 125 lb dog (many cap at 50–75 lbs).
Book immediately — sells out 4–6 months ahead."* P1 carries a per-hotel block
per leg (name, confirmation code, cancellation policy, parking, check-in/out,
passes). P3/P4 lead with an "Airbnb" quick-link. **Interpretation:** lodging is
**not a glance fact** — it's a first-class object you *shortlist (pre-booking),
filter by hard constraints (pet policy), and book earliest*. This is the gap the
owner flagged. → new **Accommodation** + **Reservation** concepts; lodging is an
**early-Gather "Stay" track**, resolved before activities.

### Theme 4 — Reservations are a cross-cutting spine under time pressure
**Prevalence:** 5/5. **Observation:** lead-times ("4–6 months ahead", "call ahead
— Wild Elder/Stone Row book up"), cancellation deadlines (P1 "full refund by
5/12"), cash-only amounts (P1 €927 sheet; P3 "$70 CASH ONLY"). **Interpretation:**
bookings (lodging + activities) need one ledger with **lead-time + deadline
awareness**, not a separate sheet.

### Theme 5 — Every claim is cited (trust is the point)
**Prevalence:** P5 strongest, all present. **Observation:** P5 cites a source +
date for *every* dog-friendly claim and every limitation ("Verified: Yelp Feb
2026"). **Interpretation:** markers carry `source`; verification is core, not
decoration — matches the project's never-invent-always-cite rule.

### Theme 6 — Hard constraints drive everything
**Prevalence:** 5/5. **Observation:** every venue checked for dog policy; every
meal "vegetarian-verified"; fixed-time bookings (balloon 05:30, catamaran 08:00);
closures/seasons (Glen Onoko CLOSED, ghost walks Sept–Nov only). **Interpretation:**
constraint filtering (dog/veg/open-now) is a primary lens, and Solve must treat
fixed-times + closures as *hard*.

### Theme 7 — Plans hold options beyond the timeline
**Prevalence:** P3, P4, P5. **Observation:** P3 "Alternate Activities"; P4
drive-radius day-trips (<1 hr, <3 hr); P5 parallel Day-4 options. **Interpretation:**
the pool persists alongside the schedule (rainy-day, backup, "if we have time").

## Jobs-to-be-done
- **Scout:** "When we're considering a trip, gather everything we might do **and
  where we'd stay**, so we can judge if it's worth it." *(lodging is in here)*
- **Secure:** "As dates approach, book what sells out — **lodging first** — so we
  don't lose it." *(lead-time pressure)*
- **Assemble:** "Before we go, produce one feasible day-by-day plan I can follow
  on the ground — without hand-building the grid."
- **Trust:** "Verify every claim (dog-ok, veg, open) with a source, so we're not
  burned on arrival."

## Pain points of the current (spreadsheet) workflow
1. Hand-building the grid (~100 cells) — pure manual labor.
2. Travel time computed by hand; no routing.
3. Lodging research lives in scattered "quick links," unstructured — no
   shortlist, no pet-policy filter, no compare.
4. Cash / cancellations / sources kept in separate sheets — fragmented.
5. No reuse across years; no "shift to best window."
6. Constraint checks (dog/veg) done venue-by-venue, by hand.

## Trip archetypes (more useful here than user segments — one planning unit)
| Archetype | Example | Stresses |
|---|---|---|
| Booked international | Slovenia | full Solve, bookings ledger, cash, multi-city legs |
| Regional dog road-trip | Jim Thorpe, Gettysburg, NRG | markers+sources (dog), drive time, lodging pet-filter |
| Basecamp + day-trips | Silverthorne | directory, drive-radius excursions, *stops at buckets* (no grid) |

## Insights → opportunities
| Insight | Opportunity | Impact | Effort |
|---|---|---|---|
| Lodging is booked first, has its own lifecycle | **Accommodation entity** + a "Stay" Gather track | **High** | Med |
| Bookings are a deadline-driven spine | **Reservation** concept + lead-time/cancellation alerts | High | Med |
| Grid is costly hand-labor | Solve auto-assembler | High | High |
| Every claim is cited | markers/limitations carry `source` | High | Low (model has it) |
| Constraints are the lens | dog/veg/open filter across pool + days | Med | Med |
| Some trips never want a grid | Solve is **optional**; agenda is a valid final form | Med | Low |

## Recommendations (prioritized)
1. **Add Accommodation as first-class, early-Gather (owner-flagged).** Shortlist
   candidate stays *pre-booking* (filter by pet policy, price, location), then
   book → confirmed (check-in/out, confirmation, cancellation policy, parking).
   Per leg. **This was missing from the spec.**
2. **Add a Reservation/Booking spine** spanning lodging + activities, with
   lead-time and cancellation-deadline awareness (the BookingsLedger grows up).
3. **Split Gather into two tracks — Stay + Do** — because lodging books on an
   earlier clock than activities.
4. Keep markers-with-sources and constraint filtering as core.
5. Build Solve (the grid auto-assembler) — but make it **optional**: agenda is a
   legitimate final form (Theme 1/7), not every trip wants clock-fidelity.

## What challenges the Gather→Block→Solve model (flagged honestly)
- **It's not single-stream.** Lodging is a parallel **Stay** track resolved
  *earliest* (booked before activities are even firm). The progression holds per
  track, but "Gather" is really *two* gathers (where to stay / what to do).
- **Solve is optional, not terminal.** P4 deliberately stops at loose buckets.
  The grid is the *ideal* output for booked-heavy trips, but forcing every trip
  to a clocked grid would mis-serve the basecamp archetype. Make Solve a
  capability you invoke, not a required final state.

## Questions for further research
- Do they ever co-plan live (two people editing), or is Janice the sole author?
- How firm are durations at Gather time vs. discovered during Block/Solve?
- Is there a post-trip step (what worked / would-return) worth capturing?
