# Chips (city attribute strip)

A row of short labels shown above the prose on every city detail page —
"Coastal", "Peninsula", "Walkable", "Real winter", "Trails out the door".
Each chip is a pure function over `cityItem.measuredMetrics`; the rules
live in code, the data lives in Supabase.

The strip is the fastest read of "what kind of place is this?" — derived,
honest, never hand-tagged.

## How it works today

```
Measurers (lib/measurers/*.js)
        ↓ writes signals to Supabase
cities.measured_metrics  (jsonb)
        ↓ rowToCity → cityItem.measuredMetrics
Chip rules (lib/chips.js)
        ↓ chipsFor(cityItem) returns labels
city-chips strip in components/PlannerShell.jsx
```

Chips are **consumers**, not measurers — they read what the pipeline wrote.
They never persist back to Supabase. Change a threshold in [lib/chips.js](../lib/chips.js)
and every city re-evaluates on the next load with no migration.

### Vocabulary

28 chips across 8 groups, defined in [lib/chips.js](../lib/chips.js):

| Group | Chips | Driven by |
|---|---|---|
| Water | Island, Peninsula, Bayfront, Harbor town, Coastal, Riverfront, Lakefront | `osm_context.*`, `water_dist_m.meta` |
| Terrain | Mountain, Foothills, Valley, Plateau, Plains, Forested, Desert | `terrain.*`, `osm_context.forest_frac_10km`, `climate_extremes.annual_precip_in` |
| Urban form | Walkable, Pedestrian street, Square-centered, Historic, Compact | `walk_score`, `osm_context.*`, `core_density` |
| Public life | College town, Tourist-heavy, Year-round, Cafés | `osm_context.university_within_2km`, `seasonal_vac_pct`, `cafe_n` |
| Winter | Snowy, Real winter, Mild winter | `climate_extremes.annual_snow_in` *(currently null)*, `climate_extremes.jan_mean_f` |
| Summer | Humid summer, Dry summer, Cool summer | `climate_extremes.jul_dewpoint_f`, `climate_extremes.jul_mean_f` |
| Outdoors | Hiking nearby, Skiable, Bikeable | `osm_context.hiking_route_within_5km`, `ski_resort_within_50km`, `cycleway_km_within_700m` |
| Admin | State capital | `admin.state_capital` |

### Selection rules

- **Within a group**, the most-specific firing chip wins. Peninsula beats
  Coastal; Mountain beats Foothills; Snowy beats Real winter.
- **Across groups**, display order is fixed (water → terrain → urban-form
  → public-life → outdoors → winter → summer → admin).
- **Cap at 4 chips per city** so the strip stays readable.
- **Climate slot reservation**: climate-winter and climate-summer are
  editorially important — the strip should not silently drop "Mild winter"
  on Charleston just because four earlier-group chips happened to fire.
  When a climate chip is capped out, it evicts the lowest-specificity
  non-climate winner. See `chipsFor` in [lib/chips.js](../lib/chips.js).

Missing signal → chip silently doesn't fire. That's by design — an unseen
metric is "not yet measured", never "false".

## Status

- **Rules** — implemented for all 30 chips; reviewed and kept after the
  "I hate the tier. The chips are kinda stupid but I like coastal and
  peninsula" pushback (the chips themselves stayed).
- **Coverage on real cities** — limited by upstream measurer coverage. See
  [METRICS_COMPLETION.md](../METRICS_COMPLETION.md) for the live per-signal
  table. With the current OSM-measurer gap (44 cities pending Overpass), the
  full vocabulary only fires on the ~33 cities that have been through the
  OSM batch.
- **`str_share_pct`-gated chips** — `tourist-heavy` and half of `year-round`
  were rewritten against `seasonal_vac_pct` (TODO #1, 2026-06-03) after
  AirDNA was retired as a source.
- **`snowy` chip** — currently silent: NASA POWER (the climate source) has
  no snowfall. Will fire once the `snowfall` measurer's NOAA NCEI run
  completes (in progress, 73/78 per METRICS_COMPLETION).

## TODOs / future direction

- **Document the specificity scores** in [lib/chips.js](../lib/chips.js) —
  the numbers are a little arbitrary today (`specificity: 50` vs `40`).
  Worth a comment block explaining the ranking strategy.
- **Materialize as a `chips` measurer once rules stabilize.** Right now
  chips are runtime-derived, which is correct while the vocabulary is still
  evolving. Once the rules settle, a measurer that writes a `chips text[]`
  column would let SQL queries say `where 'Coastal' = any(chips)` — useful
  for Calibrate / Board filtering. Trade-off: every rule edit becomes a
  re-run.
- **Chip provenance overlay.** Detail page could show *why* each chip fired
  on hover ("Coastal: OSM coastline 1.2 km away") so the rules are
  auditable from the UI, not just the source.
- **Group-priority tuning.** Display order is currently a static list; could
  be made user-tunable on the Calibrate page if it matters.
- **Per-city overrides.** If a chip is misfiring on a specific city, today
  the only fix is to change the rule (and re-evaluate everyone) or change
  the underlying measurement. A per-city override layer would be
  pragmatic but it'd reintroduce the "hand-entered values" anti-pattern
  this project is built to avoid. Not recommended unless the rule layer
  proves unable to handle real cases.
- **`year-round` is currently half-evaluated.** The seasonal_vac_pct half
  works, but the original two-leg rule (low STR share AND low seasonal
  vacancy) lost a leg when STR retired. The rule should be reviewed to
  make sure the single signal is actually enough.
