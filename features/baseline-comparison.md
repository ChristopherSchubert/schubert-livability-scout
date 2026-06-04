# Baseline comparison (vs Allison Park)

The "always show the delta vs home" UX pattern from the mockup. Every
metric and chart shows the candidate's number *alongside* Allison Park's,
plus the difference. Allison Park is the owner's home — the calibration
floor (its felt-Slovenia score sits at 0).

The idea: a candidate's absolute number means little ("9 hours of January
daylight") until you see what it actually feels like compared to a place
you've lived ("Allison Park gets 9.2 — same"). Forces every comparison
through the only ground truth the owner has.

## How it works today

- **Allison Park as anchor**: defined as a baseline reference in
  [lib/planner-data.js](../lib/planner-data.js) (`baselineReferences`)
  and used as the bottom anchor on the felt-score scale (value 0 on the
  Slovenia survey, value 1 on the setting prospect label).
- **Calibrate page** uses Allison Park's measured score as the floor of the
  ranking.
- **Baseline page** (`/baseline` →
  [components/Baseline.jsx](../components/Baseline.jsx)) lets the owner
  rate Allison Park (and the other reference places) from memory — this
  is what makes it usable as a comparison anchor.

## Status

- **Felt-score anchor**: live. The Slovenia 0–10 survey treats Allison
  Park as the floor.
- **"Delta vs Allison Park" visual pattern**: only in the mockup. The
  live city detail page does not show side-by-side or delta visuals.

## TODOs / future direction

- **Wire delta visuals into the live detail page.** Mockup chapters 4
  and 5 are full of "Newport vs Allison Park" comparisons (numeric
  deltas, hatched reference bars, baseline-anchored axes). Live route
  shows neither.
- **Extend beyond visit window.** Mockup only does it for climate; the
  by-the-numbers chapter (the metric taxonomy) is a natural fit too —
  every metric shown with its Allison Park reference value.
- **Calibration-place picker.** Hard-coded to Allison Park today. If
  the owner moves or wants to A/B against a different anchor (e.g.
  Shadyside as a more urban baseline), make it a setting on
  PlannerProvider.
- **Honest blanks.** When Allison Park hasn't been measured for a given
  metric, the delta should render as "—" not zero. Easy to get wrong
  during the wire-up.
