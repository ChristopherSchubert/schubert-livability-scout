#!/usr/bin/env python3
"""
crowd-season measurer — fills cities.crowd_season + crowd_intensity +
population_total.

Two concerns, two outputs (the log-scale-only v1 conflated them and
flattened the shape into nothing for everyone but extreme outliers):

  crowd_season    : 12 ints 0-5 = within-city SHAPE.
                    Min-max scaled inside the city's per-capita curve so
                    seasonality is always visible regardless of absolute
                    intensity.  Tells you WHEN tourists come.

  crowd_intensity : scalar 0-5 = cross-city MAGNITUDE.
                    Log-scaled peak per-capita against fixed anchors
                    (floor 100/M = 0, ceil 10000/M = 5). Tells you HOW
                    DOMINATED by tourists the city is.  Pittsburgh ≈ 0,
                    Bar Harbor ≈ 5, Mackinac clamps to 5.

The UI uses both: the SHAPE drives the curve, the INTENSITY drives how
prominently the curve renders (mute it when intensity is low, since a
"flat near-zero" line is more honest than a confidently-rendered shape
for a non-tourist city).

Method (versioned as gtrends_pop_norm_v3):
  1. Census Place B01003_001E → city-wide population.
  2. TWO Google Trends queries per city, run as separate passes:
       a. "<city> [state] hotels"          — booking-intent signal, ~4-week
          lead time before actual visit. Captured pre-trip, so the curve is
          shifted forward by 1 month to align with presence. Weight 0.4.
       b. "things to do in <city> [state]" — during-trip signal, ~1-week
          lead. Captures TOURISTS specifically (locals don't search what
          to do in their own town). Weight 0.6.
     Each Trends call is 2-term: anchor + 1 city. Larger compare batches
     (3+ terms) consistently return HTTP 500 from Google once we've used
     up the per-IP daily quota for them, while the 2-term quota is much
     more permissive. Trade-off: more total Trends calls (one per city
     per template) but the run actually completes.
  3. Per-month median over 5 years for each pass.
  4. Per-pass: divide by city population → per-million-residents.
  5. SHIFT + COMBINE: shift the hotels curve forward by 1 month; weighted-
     average the two per-capita curves.
  6. SHAPE: min-max within-city to 0-5 (anti-amplification floor).
     MAGNITUDE: log-scaled peak per-capita 100/M → 0, 10000/M → 5.

Why two queries: a single search template confounds intent and presence.
Cape May August in v2 (hotels-only) measured at 3/5 even though Cape May
is at maximum crowd through Labor Day — because by August nobody NEW is
booking, and our query was measuring booking. Adding "things to do" — a
near-real-time tourist query — pulls the post-peak crowd presence back
into the shape. Locals don't search "things to do in <own town>", so the
signal is overwhelmingly visitors. See features/visit-window.md for the
calibration rationale and the Cape May vetting.

Floor (100) and ceil (10000) are part of the citation and never shift
as cities are added — the ruler is identical across the corpus.

Usage:
  python3 scripts/measure-crowd-season.py --status      # progress, NO fetches
  python3 scripts/measure-crowd-season.py               # resume: fetch up to
                                                        # MAX_FETCHES_PER_RUN,
                                                        # stop on 2nd 429/500
  python3 scripts/measure-crowd-season.py --limit 5     # first 5 cities only
  python3 scripts/measure-crowd-season.py --only "Annapolis,Pittsburgh"
  python3 scripts/measure-crowd-season.py --refresh     # force re-measure
  python3 scripts/measure-crowd-season.py --recalibrate # discard the stored
                                                        # calibration and create
                                                        # a new one from this sweep

Quota safety (after the 2026-06-07 burn): no retry/backoff — each 429/500 is a
throttle signal; tolerate one, STOP on the second. Hard cap of
MAX_FETCHES_PER_RUN successful fetches per run. Every run is a resume — the
durable per-city cache means re-running picks up exactly where it left off
(never re-queries a cached city). So the corpus fills over a few daily windows.

Calibration (lib/calibrations/crowd-season-v3.json): the first sweep
captures Mackinac's per-template anchor curves and persists them. Every
later run — corpus refresh OR per-city onboarding — rescales against
those stored curves, so the corpus stays on a single ruler across years.

Resume state is persisted to Supabase (cities.crowd_raw.trends) the instant
each fetch lands — the DB is the source of truth, so a 429 mid-run never
loses work and there's no local cache file to go stale.
"""
import re, warnings, json, math, os, statistics, subprocess, sys, time
warnings.filterwarnings("ignore")

import psycopg2
import psycopg2.extras
import requests
from pytrends.request import TrendReq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _crowd_db import save_raw_nested   # noqa: E402  (Supabase = source of truth)


# Versioned method identifier — bake the anchors into the source string so a
# future run with different scaling produces a visibly different citation.
#
# Anchor choice: Myrtle Beach, SC (pop 36k, mass-market beach destination).
# Iterated through two prior choices:
#   - Mackinac Island (pop 583): tiny absolute search volume crushed its
#     curve to low-resolution integers (3-8) when paired against moderate-pop
#     cities in 2-term compare queries, hurting cross-batch rescale precision.
#   - Newport, RI (pop 25k): better resolution, BUT Newport RI + Newport VT
#     are both in our corpus, so the anchor collided with measured rows.
# Myrtle Beach solves both: 36k pop gives comfortable resolution headroom
# when paired with anything from 5k towns to 300k cities; its textbook-stable
# mass-market beach seasonality (no viral spikes, pure leisure, no business-
# travel contamination) makes a clean reference curve; and it is NOT in our
# corpus (never a walkable Bled/Piran candidate), so no anchor/row collision.
# Note: this changes only the *normalization reference*, not the intensity-
# ceiling definition (still CEIL_PER_M = 10,000/M — Mackinac at ~124k/M still
# clamps to intensity 5 when measured, it just no longer serves as anchor).
METHOD = "gtrends_pop_norm_v3_blend(hotels:lead=1m:w=0.4|things_to_do:lead=0:w=0.6)_anchor=myrtle_beach"
# Anchor name is BARE (no state) — Myrtle Beach is unique and the natural
# query people actually type is "Myrtle Beach hotels", not "Myrtle Beach SC
# hotels". State suffixes are only added to the rare corpus names that
# collide across states (see ambiguous_bare_names()).
ANCHOR_NAME = "Myrtle Beach"
FLOOR_PER_M = 100      # below this, no measurable tourist seasonality
CEIL_PER_M = 10_000    # at this, full tourist saturation (5/5)
LOG_RANGE = math.log10(CEIL_PER_M / FLOOR_PER_M)

# Two query templates per city, run as separate Trends passes. Each pass
# applies the template to every city; results are combined per-city after
# both passes finish. lead_months: forward shift applied to that pass's
# curve to convert "search activity" → "estimated presence". weight: how
# much that pass contributes to the final blended per-capita curve.
QUERY_TEMPLATES = [
    {
        "key":         "hotels",
        "build":       lambda city, state: f"{city} {state} hotels".strip() if state else f"{city} hotels",
        "anchor":      f"{ANCHOR_NAME} hotels",
        "lead_months": 1,
        "weight":      0.4,
        "rationale":   "booking intent — searched ~4 weeks pre-trip; shift forward 1 month to align with presence",
    },
    {
        "key":         "things_to_do",
        "build":       lambda city, state: f"things to do in {city} {state}".strip() if state else f"things to do in {city}",
        "anchor":      f"things to do in {ANCHOR_NAME}",
        "lead_months": 0,
        "weight":      0.6,
        "rationale":   "during-trip signal — searched days-before or while there; locals don't query this for their own town",
    },
]


# ── Super-conservative pacing ────────────────────────────────────────────
# Google's compare-query quota is cumulative and recovers slowly; today's
# blocks were largely self-inflicted by over-probing + restarts. Policy now:
# go painfully slow, cache every single fetch the instant it lands, and STOP
# gracefully the moment we look throttled (resume next window from cache).
SLEEP_BASE_S = 240            # 4 min between successful fetches (paranoid)
SLEEP_JITTER_S = 90           # + 0..90s, so cadence isn't a fixed fingerprint
# Quota policy (after the 2026-06-07 burn): do NOT retry a 429/500 — retrying
# just fires more requests into a window Google has already closed. Treat each
# 429/500 as a throttle signal. Tolerate ONE (could be a blip), STOP on the
# SECOND. Worst case: 2 requests after throttling begins, then we're out.
MAX_QUOTA_ERRORS = 2          # stop the run on the 2nd 429/500
MAX_FETCHES_PER_RUN = 50      # hard backstop: bank at most 50 cities/run, then
                              # stop voluntarily with headroom. Corpus finishes
                              # over a few daily windows; just re-run to resume.
# Deterministic jitter (no random module dependence): cycle through offsets.
_JITTER_CYCLE = [13, 71, 37, 89, 5, 53, 29, 61]
_QUOTA_MARKERS = ("429", "TooManyRequests", "code 500", "code 502",
                  "code 503", "code 504", "ResponseError")

# Calibration file is the permanent record of the anchor curves (Myrtle
# Beach's 12-month per-template curves from the sweep that defined this
# method's epoch). New cities onboarded after the sweep query
# [Myrtle Beach, NewCity] and rescale NewCity using
# stored_peak / current_anchor_peak so they land on the same ruler.
# Committed to the repo so the next session has it.
CALIBRATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "lib", "calibrations", "crowd-season-v3.json"
)


def colloquial(city):
    """Normalize an official city name to the term people actually search,
    purely algorithmically (no per-city map). Handles the three corpus
    irregularities that otherwise tank the Trends signal:

      "Carmel-by-the-Sea"        → "Carmel"          (drop descriptive suffix)
      "Carrboro / Chapel Hill"   → "Carrboro"        (twin towns: take first;
      "Monterey / Pacific Grove" → "Monterey"         seasonality is shared)
      "Cleveland (Tremont)"      → "Cleveland"        (parenthetical, handled
                                                       upstream in parse_name)

    'Carmel-by-the-Sea hotels' returns ~0 on Trends because searchers type
    'Carmel hotels'. Twin-town slash names share one tourism season, so
    either half's curve is the same shape — we take the first deterministically.
    """
    c = city.split("/")[0].strip()                       # twin-town → first half
    c = re.sub(r"-by-the-(sea|lake|bay)$", "", c, flags=re.I)  # drop locale suffix
    c = re.sub(r"-(on|upon|sur)-[a-z]+$", "", c, flags=re.I)   # -on-Hudson etc.
    return c.strip()


def parse_name(name):
    """Row name → (search_city, state). Strips parenthetical neighborhood,
    then normalizes to the colloquial search term.

    "Lewisburg, PA"            → ("Lewisburg", "PA")
    "Cleveland (Tremont), OH"  → ("Cleveland", "OH")
    "Carmel-by-the-Sea, CA"    → ("Carmel", "CA")
    "Monterey / Pacific Grove, CA" → ("Monterey", "CA")
    """
    parts = [p.strip() for p in name.split(",")]
    city = re.sub(r"\s*\([^)]+\)\s*", "", parts[0]).strip()
    city = colloquial(city)
    state = parts[1] if len(parts) > 1 else ""
    return city, state


def ambiguous_bare_names(rows):
    """Set of bare city names that appear under 2+ distinct states in the
    corpus and therefore NEED a state suffix to disambiguate the Trends query
    (e.g. Lewisburg PA vs WV, Newport RI vs VT). Every other name is unique,
    so it gets the bare, natural query people actually type — higher volume,
    better resolution, and it sidesteps the awkward 'things to do in X SC'
    phrasing. Computed from the live corpus so it stays correct as cities are
    added."""
    states_by_bare = {}
    for r in rows:
        city, state = parse_name(r["name"])
        states_by_bare.setdefault(city, set()).add(state)
    return {bare for bare, states in states_by_bare.items() if len(states) > 1}


def city_query(name, template, ambiguous=frozenset()):
    """Build the Trends query for one row + one template. State suffix is
    applied only when the bare name collides with another state's city."""
    city, state = parse_name(name)
    eff_state = state if city in ambiguous else ""
    return template["build"](city, eff_state)


def get_secret(name):
    return subprocess.check_output(
        ["security", "find-generic-password", "-a", "livability-scout", "-s", name, "-w"]
    ).decode().strip()


def db():
    pw = get_secret("supabase-db-password")
    return psycopg2.connect(
        host="aws-1-us-west-2.pooler.supabase.com",
        port=5432,
        user="postgres.fitjkrmiwkdolxhitroc",
        password=pw,
        dbname="postgres",
        sslmode="require",
    )


# ─── Population (Census ACS Place) ──────────────────────────────────────────

def fetch_place_population(lat, lon, api_key):
    """lat/lon → Census population with documented fallback tiers.

    Returns (population, source_string) or (None, None). The source_string
    encodes which ruler was used so cross-city comparisons stay legible
    (per the source-citation rule in CLAUDE.md). Tier order:

      1. Incorporated Place / CDP — the default ruler; tightest fit for
         most US cities.
      2. County subdivision (town) — fires when (1) misses AND the state
         uses towns as the primary subdivision (RI). Other states' cousubs
         are political districts that span far more than a village, so we
         do NOT fall through to cousub outside the whitelist.
      3. ZCTA (postal ZIP boundary) — last resort for unincorporated
         areas with no Place at all (e.g. Deep Creek Lake / McHenry MD
         21541). Postal boundaries aren't designed as geographic units
         but they're tighter than cousub and closer to "people who think
         of themselves as living here" than the nothing.
    """
    base = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
    common = {"x": lon, "y": lat, "benchmark": "Public_AR_Current",
              "vintage": "Current_Current", "format": "json"}
    acs = "https://api.census.gov/data/2023/acs/acs5"

    # Tier 1: Place (Incorporated or CDP)
    g = requests.get(base, params={**common,
        "layers": "Incorporated Places,Census Designated Places"}, timeout=20).json()
    geos = g.get("result", {}).get("geographies", {})
    feat = (geos.get("Incorporated Places") or geos.get("Census Designated Places") or [None])[0]
    if feat:
        state, place, name = feat["STATE"], feat["PLACE"], feat["NAME"]
        a = requests.get(acs, params={"get": "B01003_001E",
            "for": f"place:{place}", "in": f"state:{state}",
            "key": api_key}, timeout=20).json()
        if a and len(a) >= 2:
            pop = int(a[1][0])
            if pop > 0:  # Some CDPs (e.g. Swanton MD) return 0 — treat as miss
                return pop, f"census_acs5_2023_place_b01003:{state}{place}:{name}"

    # Tier 2: County subdivision — RI-only (state FIPS 44). RI has very few
    # Census Places; towns ARE the primary subdivision.
    g = requests.get(base, params={**common,
        "layers": "County Subdivisions"}, timeout=20).json()
    feat = (g.get("result", {}).get("geographies", {}).get("County Subdivisions") or [None])[0]
    if feat and feat["STATE"] == "44":
        state, county, cousub, name = feat["STATE"], feat["COUNTY"], feat["COUSUB"], feat["NAME"]
        a = requests.get(acs, params={"get": "B01003_001E",
            "for": f"county subdivision:{cousub}",
            "in": f"state:{state} county:{county}",
            "key": api_key}, timeout=20).json()
        if a and len(a) >= 2:
            pop = int(a[1][0])
            if pop > 0:
                return pop, f"census_acs5_2023_cousub_b01003:{state}{county}{cousub}:{name} (RI uses towns; no Place)"

    # Tier 3: ZCTA (postal ZIP boundary). The Census Geocoder's
    # "geographies/coordinates" endpoint does NOT expose the ZCTA layer in
    # its Current_Current vintage, so we point-query TIGERweb's ZCTA
    # MapServer directly. Same authority, different transport.
    z = requests.get(
        "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11/query",
        params={"geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint",
                "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
                "outFields": "ZCTA5", "returnGeometry": "false", "f": "json"},
        timeout=20,
    ).json()
    feats = z.get("features") or []
    if feats:
        zcta = feats[0]["attributes"]["ZCTA5"]
        a = requests.get(acs, params={"get": "B01003_001E",
            "for": f"zip code tabulation area:{zcta}",
            "key": api_key}, timeout=20).json()
        if a and len(a) >= 2:
            pop = int(a[1][0])
            if pop > 0:
                return pop, f"census_acs5_2023_zcta_b01003:{zcta}:ZCTA5 {zcta} (no Place — ZCTA fallback)"

    return None, None


# ─── Google Trends ──────────────────────────────────────────────────────────

# Plausible browser User-Agents to rotate across batches. Default pytrends UA
# literally identifies as the library — Google's bot-detection treats that as
# an automated request. Rotating real browser UAs alongside a fresh TrendReq
# (new session, fresh cookies) per batch reduces the recognizable "scraper"
# pattern without changing the underlying query (so measurements stay
# mathematically comparable across batches).
_UA_POOL = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0",
]
_ua_index = 0


def _next_ua():
    global _ua_index
    ua = _UA_POOL[_ua_index % len(_UA_POOL)]
    _ua_index += 1
    return ua


def fetch_trends_batch(query_strings):
    """One compare query for up to 5 distinct query strings. Returns
    {query: [12 medians 0-100]}. Caller is responsible for deduping (Trends
    fails if the same term appears twice in a payload).

    Each call creates a fresh TrendReq with a rotated User-Agent so the
    session, cookies, and UA all change between batches — same query
    semantics, different request fingerprint."""
    p = TrendReq(
        hl="en-US", tz=300, timeout=(10, 30),
        requests_args={"headers": {"User-Agent": _next_ua()}},
    )
    p.build_payload(query_strings, timeframe="today 5-y", geo="US")
    df = p.interest_over_time()
    if df is None or df.empty:
        return {q: [None] * 12 for q in query_strings}
    out = {}
    for q in query_strings:
        if q not in df.columns:
            out[q] = [None] * 12
            continue
        by = {m: [] for m in range(1, 13)}
        for ts, v in df[q].items():
            by[ts.month].append(int(v))
        out[q] = [statistics.median(by[m]) if by[m] else None for m in range(1, 13)]
    return out


class QuotaError(Exception):
    """A 429/500-family response — Google has (soft-)closed the window."""


def fetch_once(cities):
    """Single attempt. Returns the batch dict on success. Raises QuotaError on
    a 429/500-family response (caller counts it toward the stop threshold) and
    re-raises anything else (a real bug worth surfacing). No retry, no backoff
    — retrying a closed window only spends more quota. A city that errors is
    simply left uncached and picked up on the next resume run."""
    try:
        return fetch_trends_batch(cities)
    except Exception as e:
        if any(m in str(e) for m in _QUOTA_MARKERS):
            raise QuotaError(str(e)[:100]) from e
        raise


# ─── Scaling ────────────────────────────────────────────────────────────────

def shape_within_city(per_million):
    """Within-city min-max scale to 0-5 ints. Reveals SEASONALITY regardless
    of overall intensity. Anti-amplification floor: if the absolute span is
    small (a flat city), we don't stretch noise into a fake big curve."""
    vals = [v for v in per_million if v]
    if not vals:
        return [0] * 12
    lo, hi = min(vals), max(vals)
    span = hi - lo
    # Anti-amplification: a 50/M swing in a Pittsburgh-tier city shouldn't
    # stretch into a 0-5 mountain. Require at least 25% of the floor anchor
    # as raw span to scale to full 0-5; below that, compress proportionally.
    MIN_SPAN = FLOOR_PER_M * 0.25  # 25/M
    if span < MIN_SPAN:
        # Mostly flat — render as a tiny ripple, not a mountain.
        scale_to = 5 * (span / MIN_SPAN)
    else:
        scale_to = 5
    out = []
    for v in per_million:
        if v is None:
            out.append(0)
        elif span <= 0:
            out.append(0)
        else:
            out.append(int(round((v - lo) / span * scale_to)))
    return out


def shift_forward(curve, months):
    """Shift a monthly curve forward by N months (positive = later in calendar).
    presence[m] = search[(m - months) mod 12]. months=0 returns curve unchanged.

    Models lead-time bias: if 'search activity in month M' really reflects
    'visits in month M+1', shift by 1 to align the curve with actual presence."""
    if not months:
        return list(curve)
    n = len(curve)
    return [curve[(m - months) % n] for m in range(n)]


def intensity_log_scaled(per_million):
    """Peak per-capita → 0-5 scalar via log scale. Cross-city MAGNITUDE.
    Pittsburgh (peak ~150/M) → 0, Bar Harbor (~12k/M) → 5, Mackinac clamped to 5."""
    vals = [v for v in per_million if v]
    if not vals:
        return 0
    peak = max(vals)
    if peak <= FLOOR_PER_M:
        return 0
    if peak >= CEIL_PER_M:
        return 5
    x = math.log10(peak / FLOOR_PER_M) / LOG_RANGE * 5
    return int(round(x))


# ─── Resume state (from Supabase, the source of truth) ──────────────────────

def seed_cache_from_db(rows, ambiguous):
    """Build the in-memory {trends: {template: {query: {anchor,city}}}} resume
    map from cities.crowd_raw — NOT a local file. A run resumes from whatever
    raw is already persisted in the DB."""
    cache = {"trends": {t["key"]: {} for t in QUERY_TEMPLATES}}
    for r in rows:
        traw = (r.get("crowd_raw") or {}).get("trends") or {}
        for tmpl in QUERY_TEMPLATES:
            entry = traw.get(tmpl["key"])
            if entry and entry.get("anchor") and entry.get("city"):
                q = city_query(r["name"], tmpl, ambiguous)
                cache["trends"][tmpl["key"]][q] = {"anchor": entry["anchor"], "city": entry["city"]}
    return cache


def load_calibration():
    """Read the permanent anchor reference if it exists. Returns None on first
    sweep (will be created at the end)."""
    if os.path.exists(CALIBRATION_PATH):
        return json.load(open(CALIBRATION_PATH))
    return None


def save_calibration(calib):
    """Write the permanent anchor reference. Called after a sweep that
    captured fresh Mackinac curves for every template."""
    os.makedirs(os.path.dirname(CALIBRATION_PATH), exist_ok=True)
    json.dump(calib, open(CALIBRATION_PATH, "w"), indent=2)
    print(f"\n→ wrote calibration: {CALIBRATION_PATH}")


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    argv = sys.argv[1:]
    limit = None
    only = None
    refresh = "--refresh" in argv
    recalibrate = "--recalibrate" in argv
    pop_only = "--pop-only" in argv
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    if "--only" in argv:
        only = {s.strip() for s in argv[argv.index("--only") + 1].split(",")}

    # Load the permanent calibration (Mackinac anchor curves from the original
    # sweep). If --recalibrate or no file yet, this run will produce a fresh
    # calibration and persist it; otherwise it's the reference for rescaling.
    calibration = None if recalibrate else load_calibration()
    if calibration:
        print(f"using calibration: epoch={calibration.get('epoch')} ({CALIBRATION_PATH})")
    else:
        print("no calibration on file — this run will create one")
    # Per-template anchor curve captured during this run (used for rescale
    # within this run AND, if no calibration existed, persisted at the end).
    fresh_anchors = {}

    census_key = get_secret("census-api-key")
    conn = db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        select id, name, lat, lon, population_total, crowd_season,
               nps_unit_code, coalesce(crowd_raw, '{}'::jsonb) as crowd_raw
        from cities
        where lat is not null and lon is not null
        order by name
    """)
    rows = cur.fetchall()
    if only:
        rows = [r for r in rows if r["name"].split(",")[0].strip() in only or r["name"] in only]
    if limit:
        rows = rows[:limit]

    # Resume state comes from Supabase (cities.crowd_raw), not a local file.
    ambiguous = ambiguous_bare_names(rows)
    cache = seed_cache_from_db(rows, ambiguous)

    # --status: report resume progress (cached vs remaining per template)
    # with ZERO Google calls. Safe to run anytime to see how far the sweep got.
    if "--status" in argv:
        have_pop = sum(1 for r in rows if r["population_total"])
        measurable = [r for r in rows if not r.get("nps_unit_code")]   # NPS-locked excluded
        nps_n = len(rows) - len(measurable)
        print(f"\nSTATUS (no fetches) — {len(rows)} cities, population {have_pop}/{len(rows)}, "
              f"{nps_n} NPS-locked (excluded from Trends)")
        for tmpl in QUERY_TEMPLATES:
            tc = cache.get("trends", {}).get(tmpl["key"], {})
            qs = {city_query(r["name"], tmpl, ambiguous) for r in measurable}
            qs.discard(tmpl["anchor"])
            cached = sum(1 for q in qs if q in tc)
            print(f"  template {tmpl['key']:<14} {cached:>3}/{len(qs)} cached  ({len(qs)-cached} remaining)")
        cur.close(); conn.close(); return

    # ── Pass 1: ensure every selected city has a population_total ─────────
    print(f"\nPASS 1: populations  ({len(rows)} cities)")
    print("-" * 70)
    for row in rows:
        city_id, name = row["id"], row["name"]
        if row["population_total"] and not refresh:
            print(f"  {name:<30} pop {row['population_total']:>7,} (cached)")
            continue
        pop, src = fetch_place_population(row["lat"], row["lon"], census_key)
        if pop is None:
            print(f"  {name:<30} NO PLACE / no fallback hit — skipping")
            continue
        cur.execute(
            "update cities set population_total=%s, population_source=%s where id=%s",
            (pop, src, city_id),
        )
        conn.commit()
        tier = src.split(":")[0].replace("census_acs5_2023_", "").replace("_b01003", "")
        print(f"  {name:<30} pop {pop:>7,}  [{tier}]")
        time.sleep(0.8)

    if pop_only:
        print("\n--pop-only: stopping after pass 1.")
        return

    # Refresh rows after population update
    cur.execute("""
        select id, name, lat, lon, population_total, crowd_season,
               nps_unit_code, coalesce(crowd_raw, '{}'::jsonb) as crowd_raw
        from cities
        where lat is not null and lon is not null
        order by name
    """)
    rows_all = cur.fetchall()
    by_name = {r["name"]: r for r in rows_all}
    rows = [by_name[r["name"]] for r in rows if r["name"] in by_name]
    rows = [r for r in rows if r["population_total"]]
    # NPS-override cities are locked to the TOP cascade tier — Trends (lower
    # priority) must never measure or overwrite them. Drop them outright.
    nps_locked = [r["name"] for r in rows if r.get("nps_unit_code")]
    if nps_locked:
        print(f"skipping {len(nps_locked)} NPS-locked cities: {', '.join(sorted(nps_locked))}")
    rows = [r for r in rows if not r.get("nps_unit_code")]

    # Collision set is computed over the FULL corpus (rows_all), not the
    # filtered measurement subset — otherwise a --only run on one half of a
    # collision pair would wrongly treat its name as unique.
    ambiguous = ambiguous_bare_names(rows_all)
    if ambiguous:
        print(f"state-suffixed (collisions): {', '.join(sorted(ambiguous))}")
    # Re-seed the resume map from the refreshed rows with the corpus-wide
    # collision set, so the query keys match exactly what the fetch loop builds.
    cache = seed_cache_from_db(rows, ambiguous)

    if not refresh:
        # Resume: only re-measure cities that DON'T have the current v3
        # method tag. v2 (hotels-only) rows are stale and get re-measured.
        rows = [r for r in rows if r["crowd_season"] is None
                or (r.get("crowd_season_source") or "").split("_blend")[0] != METHOD.split("_blend")[0]]

    if not rows:
        print("\nNothing to measure for crowd_season (all current). --refresh to recompute.")
        return

    # ── Pass 2: Google Trends — 2-term calls (anchor + 1 city) ────────────
    # 3+ term compare queries hit a tight quota that returns persistent 500s
    # once spent; 2-term is far more permissive. Each call is [anchor, city].
    print(f"\nPASS 2: trends  ({len(rows)} cities, {len(QUERY_TEMPLATES)} templates)")
    print("-" * 70)

    # ── FETCH PASS — durable per-city cache, paranoid pacing ──────────────
    # Cache shape (anchor-independent, never re-query a fetched city):
    #   cache["trends"][template][city_query] = {"anchor":[12], "city":[12]}
    # Each 2-term call returns BOTH the anchor's curve and the city's curve on
    # that call's shared 0-100 scale; we store both so scaling is recomputable
    # offline. Every successful fetch is written to disk immediately.
    # RESUME / REPAIR: the durable per-city cache means every run is a resume —
    # `todo` is whatever isn't cached yet (never-fetched OR errored-and-skipped
    # on a prior run). Nothing special to invoke; just re-run to pick up where
    # the last window left off.
    fetched_this_run = 0
    quota_errors = 0
    stopped = None    # reason string once we stop early

    for tmpl in QUERY_TEMPLATES:
        if stopped:
            break
        tkey = tmpl["key"]
        anchor_q = tmpl["anchor"]
        tmpl_cache = cache.setdefault("trends", {}).setdefault(tkey, {})

        query_groups = {}
        for r in rows:
            q = city_query(r["name"], tmpl, ambiguous)
            query_groups.setdefault(q, []).append(r)
        unique_queries = [q for q in query_groups if q != anchor_q]
        todo = [q for q in unique_queries if q not in tmpl_cache]
        print(f"\n  TEMPLATE '{tkey}': {len(unique_queries)} queries — "
              f"{len(unique_queries)-len(todo)} cached, {len(todo)} to fetch (resume)")

        for qi, q in enumerate(todo):
            if fetched_this_run >= MAX_FETCHES_PER_RUN:
                stopped = f"per-run cap ({MAX_FETCHES_PER_RUN}) reached"
                break
            print(f"    [{qi+1}/{len(todo)}] fetch: {q!r}")
            try:
                raw = fetch_once([anchor_q, q])
            except QuotaError as e:
                quota_errors += 1
                print(f"    ✗ 429/500 (#{quota_errors}/{MAX_QUOTA_ERRORS}): {e}")
                if quota_errors >= MAX_QUOTA_ERRORS:
                    stopped = f"{MAX_QUOTA_ERRORS} quota errors — window is throttled"
                    break
                continue   # tolerate one; skip this city, it resumes next run
            # Store both curves; default to zeros if Google omitted a column.
            entry = {"anchor": raw.get(anchor_q, [0]*12), "city": raw.get(q, [0]*12)}
            tmpl_cache[q] = entry      # in-memory, for the compute pass
            # Persist to Supabase immediately — one row per city sharing this
            # query (e.g. Cleveland neighborhoods). crowd_raw.trends.<template>.
            for r in query_groups[q]:
                save_raw_nested(conn, cur, r["id"], "trends", tkey, entry)
            fetched_this_run += 1
            # Paranoid, jittered sleep between successful fetches.
            nap = SLEEP_BASE_S + _JITTER_CYCLE[fetched_this_run % len(_JITTER_CYCLE)]
            if qi < len(todo) - 1:
                print(f"    ✓ cached. sleeping {nap}s")
                time.sleep(nap)

    print(f"\nfetch pass done: {fetched_this_run} new this run"
          + (f" — STOPPED ({stopped}); just re-run to resume" if stopped else " — corpus current"))

    # Scoring is NOT this script's job. measure-crowd-season.py only records
    # raw signals into crowd_raw.trends. The master scorer turns raw into the
    # crowd_season score, applying the NPS>Trends>Wiki cascade in one place:
    print("\nRaw persisted to crowd_raw.trends. To (re)score the corpus:")
    print("  python3 scripts/score-crowd-season.py --write")
    cur.close()
    conn.close()
    print(f"\ndone — recorded raw ({METHOD})")
    return


if __name__ == "__main__":
    main()
