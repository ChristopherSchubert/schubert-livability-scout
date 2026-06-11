# Project Handoff — "The Slovenia Test" Location Scoring System

**Purpose of this document:** Hand off a quantitative location-scoring project to Claude Code (or any engineer) so it can be finished and run without re-deriving the reasoning. Read this top to bottom before touching code. The hard part of this project was *not* the code — it was figuring out what to measure and what *not* to fake. Those lessons are encoded below; please respect them.

---

## 1. The goal, in one paragraph

The owner and his spouse spent time in Bled and Piran (Slovenia) and want to find US places that reproduce that lived feeling — walkable, nature-adjacent, real public life, alive year-round — as a **secondary** home. Primary residence stays in Allison Park / greater Pittsburgh (family-anchored). They will road-trip to scout candidates (a big dog is planned, so **driveable matters** and a single-family house with a yard is preferred over a condo). The deliverable is a **pre-visit scoring model** that ranks candidate places from data, so trips are spent on high-probability locations rather than guesses.

Constraints that shape candidates (soft unless noted):
- Driveable from Pittsburgh (≤ ~8 hours) is strongly preferred (dog).
- Year-round resident life — **a place that dies in the off-season is disqualifying** (this is the owner's stated dealbreaker).
- Not "brutal/shut-in" winters, and gray winters are disliked **unless the place is otherwise exceptional**.
- Not a hyper-wealthy resort vibe (e.g. "don't suggest Laguna Beach") — but they're willing to *test* one.
- Lacto-ovo vegetarian (relevant only if the system ever adds a food/dining dimension).

---

## 2. The single most important lesson (do not skip)

**Do not invent data. Ever.** This project's first several iterations failed because the assistant generated plausible-sounding specifics (street names, "resident pulse" verdicts, density impressions) that were never verified. That destroyed trust and produced rankings that were really just opinion with numbers attached.

Concretely, two failure modes to avoid:
1. **Fabricated qualitative detail** dressed as fact ("Beaver Street has the right density").
2. **Hand-entered 0–10 "scores"** for subjective dimensions (scenic drama, immersion) presented as if they were measurements. This is the subtle one — it *looks* quantitative but is just vibes in a numeric column.

**Rule:** Every value that feeds a score must be either (a) a number computed from a real data source (OSM, DEM/elevation, Census/ACS, Redfin, NOAA), or (b) explicitly flagged as an estimate/unknown. If it can be quantified, it must come from hard data. Qualitative interpretation is allowed only where it's labeled as such and never silently weighted as if objective.

**Corollary:** Do not claim the model "matches the owner's gut." The model reflects its inputs. The owner's gut is captured *only* through his firsthand ratings (Section 5). Earlier the assistant repeatedly attributed its own scoring choices to the owner — don't.

---

## 3. What exists right now (the artifacts)

Three files have been produced and should be treated as the starting point:

### `measure_places.py`  — objective metric extraction
Takes a list of `(name, lat, lon, radius_m)` core locations and computes objective metrics from data. **Requires network** (OSM Overpass, osmnx, open-elevation API), which was NOT available in the environment where it was written — so it has **not been run yet**. Running and validating it is task #1.

Computes (all objective, all sourced):
- `relief_std_m`, `relief_range_m` — terrain drama, from an elevation grid (open-elevation API).
- `water_dist_m` — distance to nearest significant water (Overpass).
- `intersection_den` — intersections/km² (osmnx, degree ≥ 3 on undirected graph).
- `mean_block_m`, `street_km` — street-segment geometry (osmnx).
- `carfree_km`, `carfree_frac` — pedestrian/footway/living_street length & fraction (osmnx).
- `bldg_coverage` — building footprint area / core area (osmnx features).
- `cafe_n, rest_n, bar_n, pharmacy_n, grocery_n, daily_needs_n` — POI counts (osmnx features).

Outputs `measured_metrics.csv` (raw numbers — **not** 0–10 scores; banding/scaling happens downstream).

### `fit_weights.py` — learn weights from the owner's reactions
This is the heart of the corrected approach. Instead of anyone choosing weights, it fits them by **ridge regression** against the owner's firsthand ratings of places he's actually been.
- Inputs: `measured_metrics.csv` + `your_ratings.csv` (`place, feeling` where feeling is 0–10).
- Standardizes metrics (z-scores) so coefficients are comparable.
- `RidgeCV` over a range of alphas (handles few samples + correlated predictors).
- Reports standardized coefficients = learned metric importance.
- **Leave-one-out CV R²** — honest predictive check. Prints a warning when it's low and explicitly tells the user not to trust the weights with too few ratings.
- Scores all places (including unrated ones) with the learned model.
- Currently runs on built-in DEMO data so it executes today; pass `--real` to use the CSVs.

### `location_scores.xlsx` — the older hand-scored spreadsheet (LEGACY / reference only)
A 20-metric weighted-sum spreadsheet with editable weights, a scoring-key tab, and several cities + controls scored by hand. **Its landscape/public-realm columns are hand-entered opinions and should not be trusted as data.** Keep it only as: (a) a record of the metric taxonomy and band definitions, and (b) the list of calibration controls. The regression approach in `fit_weights.py` supersedes it. Do not extend the hand-scored sheet with more cities — that just multiplies opinion.

---

## 4. The metric taxonomy (what to measure and why)

Grouped. The first group is the one conventional walkability scores miss and is the project's key insight.

**LANDSCAPE / SCENIC DRAMA** — *the differentiator.* Bled and Piran are defined by dramatic landscape and prospect (alps, lake, castle crag, Adriatic, sea views). Flat inland walkable neighborhoods (e.g. Shadyside) can ace every urban metric and still feel dead because they lack this. Measure objectively via:
- terrain relief (elevation std-dev / range from a DEM),
- distance to major natural feature (water; ideally also mountains/peaks),
- prospect/viewshed (proper GIS viewshed from the core is the gold standard; relief + water proximity is a usable proxy until then).

**IMMERSION / FABRIC** — does the place "close around you" (the Rovinj feeling) or break into parking lots after a few blocks? Proxy with: size of contiguous walkable fabric, intersection density, mean block length, building coverage, street-wall continuity.

**PUBLIC REALM** — split into independent measures (do NOT bundle into one "has a square" binary; that was a bug): pedestrianization (car-free street length/fraction), plaza size & whether it's programmed/used, count of businesses fronting the public space, realm type (square vs. linear spine vs. none).

**RESIDENT LIFE** — core density (tract-level, NOT city-wide — city-wide hides whether the *core* has life), residential vacancy/seasonal-use %, daily-needs business count, walk score, café/bar count.

**CLIMATE / SEASONALITY** — days/yr below freezing, annual clear/sunny days, December daylight. Encodes the "not shut in all winter" dealbreaker.

**HISTORY / FABRIC AGE** — grid platting date, NRHP district status. Note: the owner does NOT want "history as museums"; this captures *age of the bones* (pre-automobile, built-for-walking), which correlates with the immersion feeling. Keep it modestly weighted.

**COST / VIBE-FIT** — neighborhood median home price (Redfin, fixed "latest month" definition), short-term-rental / seasonal-housing share (high STR = hollowed-out resort = penalty). The owner called affordability a *soft* preference, so keep weight low.

---

## 5. The thing the project still needs (critical path)

**The owner's firsthand ratings are the answer key, and they are not yet collected.** Without them the weights are unfounded. The four known ground-truth points so far:
- Bled — loved (≈10)
- Piran — loved (≈10)
- Shadyside, Pittsburgh (Walnut/Highland near Yardley Way) — left him cold (≈3)
- Lawrenceville, Pittsburgh (Butler St / Industry Public House sidewalk) — left him cold (≈3)

**Action:** get the owner to fill `your_ratings.csv` with as many places he's actually spent time in as possible (anywhere — US, Europe, places that did nothing, places that hit), each with a 0–10 "feeling" score. Target ≥ ~8–10 ratings before treating learned weights as meaningful; the script's leave-one-out R² will tell you when it's predictive. **Do not invent ratings on his behalf** — collect them.

Also useful as reference places (familiar to the owner, with a known directional read to sanity-check against — not to fabricate): Sewickley, Oakmont, Verona, Allison Park (the owner's home). Only include these if the owner confirms his reaction; otherwise leave them as unrated test rows.

---

## 6. Recommended build plan for Claude Code

1. **Run `measure_places.py` for real** (network needed). Install: `pip install osmnx networkx requests numpy pandas`. Start with the reference + control set already in the file (Piran, Bled, Ljubljana, Shadyside, Lawrenceville, OTR, Tremont, Lancaster). Verify outputs are sane (e.g. Piran `carfree_frac` should be high; Bled `relief_std_m` should be high; Shadyside relief low). Fix any tag/parse issues (OSM tagging varies by country — Slovenia vs US).
2. **Harden the measurement code:** add retries/caching for the public APIs (Overpass and open-elevation rate-limit and time out); cache raw responses to disk so re-runs are cheap. Consider swapping open-elevation for a real DEM (SRTM/USGS 3DEP via `elevation` or `rasterio`) for reliable relief. Add a proper **viewshed** metric if feasible (GRASS/`richdem`) — it's the most faithful "prospect" measure.
3. **Collect the owner's ratings** into `your_ratings.csv` (Section 5). This gates everything.
4. **Run `fit_weights.py --real`.** Inspect learned coefficients and LOO R². If R² is low, the measured metrics aren't capturing the feeling — add metrics (viewshed, water *visibility* not just distance, mountain proximity) rather than forcing weights.
5. **Build the candidate list** (driveable ≤8h from Pittsburgh first). Geocode each to a real core intersection (lat/lon). Measure them. Score with the learned model. Rank.
6. **Output**: a clean ranked table + per-place metric breakdown, plus a flag column for data uncertainty. Keep the editable-weights idea, but the *default* weights should now come from the regression, not hand-tuning.

---

## 7. Engineering preferences (from the owner)

- Stack preference: **Python**, and broadly GCP / React for app work if this grows a UI. Owner is an expert engineer / ML leader — write robust, clean, well-structured code; don't over-explain basics.
- Favor **reproducibility**: every metric value should be traceable to a source and a fixed definition (one canonical source per metric, identical across all places — mixing city-wide vs. tract-level vs. ZIP-level numbers was a real bug; pin the geographic unit).
- Prefer **tract-level / core-polygon** geography over city-wide stats for anything resident-life related.
- Encode **uncertainty** rather than hiding it (flag wide source disagreement; let a place rank "confidently" only if robust across the range).

---

## 8. Explicit non-goals / cautions

- Do not resurrect the 150-city "every walkable US neighborhood" list — it was unverified and not useful.
- Do not present exact 0–100 scores as precise when inputs are noisy; coarser confident output beats false precision.
- Do not add a heavy "history/museums" weight — not what the owner wants.
- Do not assume a single perfect town exists; the model ranks *candidates to visit*, it does not certify a winner. Final judgment is made on the ground (the Shadyside lesson: a place can pass every metric and still feel dead).
- The owner does NOT own property anywhere except the Allison Park primary residence. Do not assume a second property exists.

---

## 9. File inventory

| File | Status | Notes |
|---|---|---|
| `measure_places.py` | written, **not yet run** | needs network; harden + cache + run |
| `fit_weights.py` | working on demo data | needs real `measured_metrics.csv` + `your_ratings.csv` |
| `your_ratings.csv` | **does not exist yet** | owner must fill — critical path |
| `measured_metrics.csv` | generated by measure_places.py | objective numbers only |
| `location_scores.xlsx` | legacy, reference only | hand-scored; do not trust landscape columns or extend |

**Start at Section 6, step 1.**
