# Baseline comparison (vs Allison Park)

The "always show the delta vs home" UX pattern from the mockup. Every
metric and chart shows the candidate's number *alongside* Allison Park's,
plus the difference. Allison Park is the owner's home — the familiar
reference every candidate is compared against. On the 0–10 Slovenia survey
it sits at the "feels like home, not like a Slovenian lakeside town" end of
the scale — the natural reference point, not a verdict on the place.

The idea: a candidate's absolute number means little ("9 hours of January
daylight") until you see what it actually feels like compared to a place
you've lived ("Allison Park gets 9.2 — same"). Forces every comparison
through the only ground truth the owner has.

## How it works today

- **Allison Park as the home reference**: defined as a baseline reference in
  [lib/planner-data.js](../lib/planner-data.js) (`baselineReferences`)
  and used as the home end of the felt-score scale (value 0 on the
  Slovenia survey = "as familiar as home," value 1 on the setting prospect
  label).
- **Calibrate page** shows Allison Park's measured score as the home
  reference line in the ranking.
- **Baseline page** (`/baseline` →
  [components/Baseline.jsx](../components/Baseline.jsx)) lets the owner
  rate Allison Park (and the other reference places) from memory — this
  is what makes it usable as the home comparison reference.

## Status

- **Felt-score home reference**: live. The Slovenia 0–10 survey anchors its
  familiar-home end at Allison Park.
- **"Delta vs Allison Park" visual pattern**: **live across Chapters IV & V**
  as of 2026-06-24 (commit `e63a63e`). The When-to-go chapter shows climate
  extremes with the home reference; the By-the-numbers chapter renders each
  metric with `Allison Park · X` italicized underneath the value plus a small
  tick on the bar at home's 0–100 position so the candidate-vs-home delta
  reads at a glance. Honest blanks preserved — no fake zeros where home
  hasn't been measured for a metric (the reference line is simply omitted).

## TODOs / future direction

- **Calibration-place picker.** Hard-coded to Allison Park today. If
  the owner moves or wants to A/B against a different anchor (e.g.
  Shadyside as a more urban baseline), make it a setting on
  PlannerProvider.
- **Honest blanks.** When Allison Park hasn't been measured for a given
  metric, the delta should render as "—" not zero. Easy to get wrong
  during the wire-up.
