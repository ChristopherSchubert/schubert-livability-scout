# Trip planner — systems architecture

> The engine, not the skin. The component spec
> ([trip-planner-components.md](trip-planner-components.md)) and the mockup
> describe what a trip *looks like*; this describes the systems that **produce**
> one. Grounded in real infra (the `pois` cache, `lib/measure.js` haversine,
> `lib/trip.js`), with an honest line between **what exists**, **what's a scoped
> build**, and **the v1 that's deliberately naive**.

Six systems, in dependency order: **Sourcing → Markers → Block → Routing →
Solve → Reservations.**

---

## 1. Candidate sourcing (Gather: the Do-pool + Stay-shortlist)

**Job.** Fill the pool with real candidate places near a leg's stay zone, by
category, ranked — so Gather is *populated from data*, not hand-typed.

**Inputs.** Leg city `{lat, lon, stayZone}` (real on the city row) + a radius +
a category set.
**Output.** `candidate[] = { placeId, name, place{lat,lon,address}, kind,
category, rating, ratingCount, priceLevel, markers[] }`.

**Data — REAL.** The `pois` table (Google Places cache) already holds, near
Bled (46.3683, 14.1133): Pizzeria Rustika ★4.7, Old Cellar Bled ★4.5, Bled
Castle ★4.4, Confectionery Zima, the zipline — *including the exact places
Janice's plan chose*. Columns: `name, lat, lon, primary_type, types[], rating,
user_rating_count, price_level, formatted_address`.

**Algorithm.**
1. Radius query: `pois` where lat/lon within ~Δ of the leg (the query in
   `lib/measure.js` style; box-then-haversine).
2. Map Google `primary_type` → our `kind`/`category` (e.g. `*_restaurant|cafe|
   bar` → meal; `tourist_attraction|museum|park|hiking_area` → activity;
   `hotel|lodging|bed_and_breakfast` → lodging).
3. Rank by a confidence score = `rating × log10(ratingCount)` (popularity-
   weighted quality), filterable by category + markers.
4. De-dup by `place_id`.

**Honest v1.** Pure read over the existing cache — no new API calls. Lodging
sourcing is thin (hotels are booked on external sites; the Stay track mostly
*records* a chosen stay, optionally seeded from `pois` lodging types).

---

## 2. Markers + citation (the verification system)

**Job.** Attach **cited** attribute markers (dog/veg/kid/patio/cash/accessible)
to candidates — the trip equivalent of a measured metric with a source.

**The real gap.** Our `pois` fetch (`scripts/.fetch-pois.mjs` FIELD_MASK) caches
*name/type/rating/price/address* — it does **not** cache the marker fields. So
markers cannot be derived from the current cache beyond weak inference
(price_level → cost; primary_type → veg-leaning cuisine).

**What's available (scoped build).** Google Places API (New) exposes exactly
these as Place fields:
`allowsDogs` · `servesVegetarianFood` · `goodForChildren` ·
`outdoorSeating` (patio) · `accessibilityOptions.wheelchairAccessibleEntrance` ·
`paymentOptions.acceptsCashOnly`.
→ **System task:** widen the FIELD_MASK and re-fetch (a Place Details call per
candidate, or a richer `searchNearby`). Each marker stamped
`source: "Google Places · fetched <date>"`.

**Provenance rule (never invent).** A marker is set only when a source provides
it; unknown stays **null** ("not verified"), never a guessed ✅. Richer dog data
(BringFido, as Jim Thorpe cites) is a *future external source*, not faked now.

**Honest v1.** Cost/cash from `price_level` + booking; the Google marker fields
behind a one-time re-fetch; everything else null-until-sourced.

**Status (2026-06-10): BUILT + proven, trip-scoped.** `pois.attributes` +
`attributes_fetched_at` (migration 0014, applied). Two fetchers:
`scripts/enrich-trip-pois.mjs` (matches a Trip's entries → cached POIs inside
the legs' boxes, fetches ONLY those — the default) and
`scripts/fetch-poi-attributes.mjs` (leg-area batch, available but not the
default; one Details call per place, so scope deliberately). `deriveMarkers()`
in [lib/sourcing.js](../lib/sourcing.js) emits each marker cited
`Google Places · <fetch date>`; `openingHours()` feeds Solve's soft constraint.
Verified end-to-end on the Slovenia trip: Pizzeria Rustika dog+veg+kid+patio,
Hotel Piran dog-friendly, and the bonus catch — Public & Vegan Kitchen Bled is
**closed Mondays** (exactly what the open-hours constraint exists for).
Explicit `false` yields no chip (chips assert presence); absent field = null =
"not verified", never guessed.

---

## 3. Block (fuzzy placement)

**Job.** Move candidates into days at coarse time, designate anchors.

**Data.** Entry `time` becomes a discriminated shape:
`{ mode: "bucket", bucket: "morning|afternoon|evening" }` |
`{ mode: "range", start, end }` | `{ mode: "point", start, end }`.
`role: anchor|connective` (already in `lib/trip.js`). Block sets `bucket` time
on anchors; Solve promotes to `point`.
**Interaction.** Drag candidate → day bucket (`@dnd-kit`). Pure state until
Solve runs.

---

## 4. Routing / travel-time

**Job.** Minutes between two consecutive pins.

**REAL today.** `haversine(aLat,aLon,bLat,bLon)` in `lib/measure.js` →
straight-line metres. **No road routing exists.**
**v1 (honest estimate).**
`minutes = haversine_km × 1.3 (road factor) / speed`, speed = 4.5 km/h walking
if < 1.2 km, else 50 km/h driving. Labeled an *estimate* in the UI.
**Upgrade path.** OSRM/Valhalla on the OSM tiles the app already uses → real
road times + polylines for the map. Swappable behind one `travelTime(a,b)` fn.

---

## 5. Solve — the auto-assembler (core IP)

**Job.** anchors + constraints → an ordered, travel-aware, clocked day. The
thing the mockup *faked*.

**Inputs (per day).** anchors `[{ title, duration, location, fixedTime?,
openHours?, todPref? }]`, the day's lodging pin (start/end), meal windows.
**Output.** timed `entries[]` (anchors at `point` time + inserted `connective`
travel/meal/buffer/free) = the grid. Plus a **feasibility verdict**.

**Constraints.**
- **Hard** (never violated; conflict → *flag*, don't guess): `fixedTime`
  bookings (balloon 05:30, catamaran 08:00), the day's anchor set.
- **Soft** (heuristics): ordering, `openHours`, meal timing, buffer length.

**Algorithm (v1 — deliberately greedy, fully editable after).**
1. Pin fixed-time anchors at their clock slots.
2. Order the rest by **nearest-neighbour from the lodging/previous pin**
   (minimise travel), respecting `todPref` and not overlapping pinned slots.
3. Between consecutive pins, insert a `travel` entry from §4.
4. Insert `meal` entries in meal windows where a gap allows; `buffer`/rest after
   heavy items; surface remaining gaps as `free`.
5. Assign clock times sequentially from the day start.
6. **Feasibility:** if the chain overflows `dayEnd`, or two fixed-times collide,
   or an anchor lands outside `openHours` → emit a flag (over-packed / conflict),
   **never silently drop**.

**Re-Solve & pins.** Janice's manual edits become `pinned: true` overrides Solve
respects on re-run. "Shift to next year" = re-Solve the same anchors against new
dates (+ the Prime-window engine).

**Honest v1.** Greedy nearest-neighbour + haversine estimate, single-day. Not a
global optimiser, not opening-hours-perfect. Goal: a good-enough grid she nudges.

---

## 6. Reservations (the booking state machine)

**Job.** Track lodging + activity bookings through their lifecycle, deadline-aware.

**States.** `candidate → shortlisted → booked → confirmed` (+ `cancelled`).
**Fields.** `{ kind: lodging|activity, leadTime?, bookBy?, confirmation?,
cancelBy?, prepaid?, cost? }`.
**Derived — REAL today.** `cashNeeded()` (cash-only sum by currency, = €927 on
Slovenia) and `bookingsLedger()` already exist in `lib/trip.js`; this grows them
to span lodging and rank by `bookBy`/`cancelBy`.

---

## What's real vs. to-build (no vibes)

| System | Real today | Scoped build | v1 is naive about |
|---|---|---|---|
| Sourcing | `pois` cache (has Bled's real places) | type→kind map, ranking, radius query | lodging sourcing thin |
| Markers | price/type weak signal | widen FIELD_MASK + re-fetch Google marker fields | non-Google sources (BringFido) |
| Block | `lib/trip.js` entry/role model | fuzzy-time shape, dnd-kit | — |
| Routing | `haversine()` | OSRM later | estimate, not road time |
| Solve | the 79-entry fixture | the greedy assembler | global optimisation, open-hours |
| Reservations | `cashNeeded`/`bookingsLedger` | lodging + lifecycle + deadlines | — |

## Build order
1. **Solve prototype** against the real Slovenia Bled day (prove the engine).
2. **Sourcing** query over the real `pois` cache (prove the pool).
3. Markers re-fetch · Block UI · Routing upgrade · Reservation lifecycle.
