# Onboarding a New City

How to add a candidate place to Livability Scout so it carries the same three
data tracks every other city has. Follow this top to bottom. **The cardinal
rule (from the project handoff): never invent a number. Every value is either
computed from a cited source or left explicitly empty.**

---

## The three tracks a city must support

A fully-onboarded city carries data in three independent tracks. They never
blend, and they have different rules about who may fill them:

| Track | Where it lives | Who fills it | Rule |
|---|---|---|---|
| **1. Measured** (objective) | `measuredMetrics` | the pipeline only | Every metric cited to one canonical source, or left `null` ("not yet measured"). Never hand-entered. |
| **2. Felt** (subjective) | `survey` | the owner, via the questionnaire | Filled only after a visit (or from memory for a baseline). Five anchored axes + the 0–10 Slovenia score. |
| **3. Visit window** | `visitClimate`, `crowdSeason`, `seasonNotes` | climate from NOAA; crowd/notes qualitative | Climate is cited data; crowd season is an observed qualitative read. |

A new city starts with **all three empty** and graduates as data arrives.

---

## Step 1 — Create the city record

Cities are constructed by the `city()` factory in `lib/planner-data.js`:

```js
city(name, stayZone, heartIntersection, tripWeek, why, ifWins, ifFails, blocks)
```

| Arg | What it is | Example |
|---|---|---|
| `name` | "City, ST" — must be unique; drives the slug | `"Annapolis, MD"` |
| `stayZone` | the neighborhood you'd actually live in | `"City Dock / Eastport"` |
| `heartIntersection` | the single corner that is the heart of it | `"Main St & Randall St"` |
| `tripWeek` | loose scheduling tag, or `""` if none | `"Sep week 2"` |
| `why` | 2–4 sentences: why this place belongs on the list | (prose) |
| `ifWins` | the gut gate — what would mean it hit | `"A true harbor piazza with year-round life."` |
| `ifFails` | the gut gate — what would mean it missed | `"Dead off-season; a summer-only postcard."` |
| `blocks` | array of specific blocks/zones to walk | `["Main St between …", …]` |

The factory auto-fills empty `survey`, `measuredMetrics` (all metric keys
present, all `null`), and leaves the visit window empty unless a seed exists.

To add a candidate to the default slate, append a `city(...)` call to
`starterCities` in `lib/planner-data.js`. To add it at runtime, use the
**+ Add candidate** button on the Board (it drops in unmeasured).

---

## Step 2 — Geocode the heart (required for the pipeline)

The objective pipeline measures a circle around one point. Add the city's
heart `(lat, lon, radius_m)` to `PLACES` in `scripts/measure_places.py`:

```python
("Annapolis, MD", 38.9784, -76.4922, 700),   # ~700m ≈ a 10-min-walk core
```

Use the **exact corner you'd want to live at**, not the city centroid. The
radius is the core you're judging (600–800m for a compact town).

---

## Step 3 — Run the measurement pipeline (Track 1)

```bash
pip install osmnx networkx requests numpy pandas
python scripts/measure_places.py        # writes measured_metrics.json
```

This computes every metric in the taxonomy from its canonical source:

- **Setting** — terrain relief (DEM), water distance (OSM), viewshed
- **Aliveness** — café / bar / restaurant counts (OSM), Walk Score
- **Fabric** — intersection density, block length, car-free share, building coverage (OSM)
- **Realness** — daily-needs businesses (OSM), core density + seasonal vacancy (Census ACS), STR share (AirDNA), median price (Redfin)
- **January** — days below freezing, clear days (NOAA NCEI), December daylight

Then import into the app:

```bash
node scripts/import-scores.mjs           # measured_metrics.json -> manifest/state
```

Each imported value is stored as `{ value, asOf }` next to its fixed source
from `metricTaxonomy`. **Anything the pipeline couldn't get stays `null`** and
the city's Detail page shows "not yet measured" for it — never a guess.

---

## Step 4 — Seed the visit window (Track 3)

Climate normals are public and citable; add them to `visitClimateSeed` in
`lib/planner-data.js` (or let the pipeline write them):

```js
"Annapolis, MD": {
  // NOAA NCEI 1991–2020 normals: m(highF, lowF, rainyDays, daylightHr)
  climate: [m(45,29,10,9.6), m(48,30,8,10.7), /* … 12 entries … */],
  crowd:   [2,2,3,4,4,5,5,5,4,3,2,2],   // 0–5, 5 = peak tourist (qualitative)
  notes: {
    charm: "Comfortable + crowds thinned — see it lovely when you can breathe.",
    truth: "The off-season test — does the harbor hold its life in the cold?",
  },
},
```

The app computes the **Charm** and **Truth** windows from this automatically
(see `cityVisitWindow`). Keep `notes` month-agnostic — the computed month
fills in the specifics.

---

## Step 5 — Baseline calibration (Track 2, prerequisite)

The felt scores are only meaningful once the owner has baselined the
reference places (Bled, Piran, Shadyside, …) from memory on the **Baseline**
tab. This is the answer key. Do this once, before trusting any felt-vs-measured
comparison. A new candidate gets its felt score after an actual visit, via the
**Decide** tab's questionnaire — identical instrument, so it's comparable to
the baselines.

---

## Step 6 — Verify

- Board: the city appears as a card with its hero image.
- Detail: **Measured** panel shows the cited taxonomy (values or "not yet measured"); the **Measured | Felt** twin reads correctly.
- Visit: **When to visit** shows Charm + Truth windows (or "awaiting climate data").
- Images: one hero, swappable via search or pasted URL.

---

## Checklist

```
[ ] city(...) added to starterCities (or added via the UI)
[ ] heart geocoded into scripts/measure_places.py PLACES
[ ] measure_places.py run; measured_metrics.json produced
[ ] import-scores.mjs run; Detail shows cited measured values
[ ] visit-window climate seeded (or pipeline-filled) + crowd/notes
[ ] hero image set on the Images tab
[ ] (once) reference places baselined on the Baseline tab
[ ] felt survey captured after the visit (Decide tab)
```

**If you can't source a number, leave it empty. An honest blank beats a
confident guess — that is the whole point of this tool.**
