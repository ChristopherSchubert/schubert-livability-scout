# Spike: timezone model (issue #37)

> Risk #6 on the Trip Planner epic (#7). Slovenia is single-zone, so timezones
> are invisible today — but the model must be right *before* the first US
> multi-zone trip, or it's a painful retrofit. **Status: model decided + a
> verifiable slice built (`legTzChanges` + tz on `tripDays`); full multi-zone
> render lands with the display atoms (#21) and DayPlan (#28).**

## The decision

### Storage: wall-clock local + the leg's IANA tz — never UTC
An entry stores its time as a **wall-clock local string** (`"09:00"`, the v2
`time` atom) plus the **leg's IANA `tz`** (`"Europe/Ljubljana"`,
`"America/New_York"`). We deliberately **do not** store UTC instants.

Why: a trip is planned in *local* terms — "balloon at 5:30 AM" means 5:30 in
Bled, full stop. If we stored UTC and a tz changed (DST, or the user shifts the
trip to next year), the displayed local time could **drift** by an hour. Wall-
clock-local + tz means "9:00 AM" is always 9:00 AM where you're standing. This
is the same honesty rule the rest of the project follows: store the thing you
actually know, not a derived form that can silently rot.

### Where `tz` lives
- **Trip default:** `trip.glance.tz` (the home/primary zone).
- **Per-leg override:** `leg.tz` (each leg can sit in its own zone).
- `tripDays(trip)` already resolves each day's tz as `leg.tz ?? glance.tz ??
  null` (lib/trip.js) — so the day grid knows its zone without extra plumbing.

### Display
- Times render with a zone label: **"9:00 AM · CEST"** (TimeChip, atom #21).
- A **leg-boundary day where the zone changes** gets a flag ("⏰ clocks change:
  CEST → EDT") so the traveler isn't caught out. Built now as `legTzChanges()`.

### Flights — the one entry that spans zones
A transport entry of `mode: "flight"` carries **each end's local time + that
airport's tz** (the v2 `transport` sub-shape: `departLocal`, `arriveLocal`).
Both ends are labeled independently ("FRA 20:00 CET → LJU 21:30 CEST"). Solve's
auto-generated *leave-for-the-airport* connective uses the **departure** tz +
`arriveBy` lead, never the arrival zone.

### Computing a real instant (only when needed)
Routing/Solve occasionally needs a duration across a tz boundary. Resolve the
UTC instant **on demand** from (wall-clock-local + tz) via `Intl.DateTimeFormat`
/ the platform tz database — compute, never store. Keeps the stored form
canonical and drift-free.

## The verifiable slice built now
`legTzChanges(trip)` (lib/trip.js) returns the leg-boundary days where the IANA
zone changes, each with `{ date, from, to }` — the data the UI flags. Proven in
`tests/trip.test.js` against a synthetic two-zone US trip (NYC → Denver), with
the single-zone Slovenia trip asserting **no** flags. This nails down the part
of the acceptance criteria that doesn't need the full render.

## Remaining (with the UI phases)
- TimeChip zone labels (#21) + the day-boundary flag surfaced in DayPlan (#28).
- A flight rendering both ends local + labeled (#23 TransportSection).
- Solve's leave-for-airport connective honoring the departure tz (#27/#28).
