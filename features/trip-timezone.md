# Trip timezone model (#37 spike)

**Status: spike — recommendation, not yet built.** Today entry times are naive
`"HH:MM"` strings with no zone (fine for a single-country trip read on the
ground). A multi-zone trip (the Slovenia trip already crosses into Italy/Venice;
a US→EU trip crosses 6+ hours) needs a model so "10:00" is unambiguous.

## The problem
- Naive `HH:MM` means a flight that departs 17:30 CEST and lands 21:30 CEST after
  a 6h flight looks like a 4h flight if one end is actually a different zone.
- Solve's travel math is duration-based (minutes) so it's zone-agnostic — but
  *display* and *day boundaries* are not.

## Recommendation (cheapest correct model)
1. **Zone lives on the leg, not the entry.** Add `leg.tz` (IANA, e.g.
   `Europe/Ljubljana`) — entries inherit their day's leg zone. One trip rarely
   has >1 zone per leg.
2. **Store times as leg-local `HH:MM`** (unchanged) + the leg's `tz`. Local time
   is what a traveler reads; the zone disambiguates.
3. **Only flights/trains cross zones.** A travel entry gets an explicit
   `fromTz`/`toTz` so the duration reads true; everything else is leg-local.
4. **Display** in leg-local with a small zone chip when the zone changes from the
   previous entry. Never silently convert.
5. **Day boundaries** = the leg-local calendar day (a 23:00→01:00 redeye spans
   two day columns honestly).

## Scope when built
- Migration: `leg.tz` (no new table). Default to the city's tz (lookup by
  lat/lon, or hand-set on the leg).
- `lib/trip.js`: a `legTzFor(date)` helper; flight-duration display uses both
  ends' tz.
- No change to Solve (duration-based). Display + day-boundary code reads tz.

Deferred until a genuinely multi-zone trip is being planned in anger; the
single-zone naive model is correct for the trips on hand.
