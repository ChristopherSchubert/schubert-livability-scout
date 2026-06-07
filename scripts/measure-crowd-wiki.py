#!/usr/bin/env python3
"""
crowd_season — Wikipedia × Wikivoyage fallback tier.

Pulls monthly pageviews for every city from BOTH Wikipedia (high-traffic but
contaminated by events/universities) and Wikivoyage (travel-coded but low-
traffic/noisy), then blends them with a traffic-gated geometric mean so the
two cancel each other's noise: months where both are elevated survive, months
where only one spikes are damped.

Cascade position: this is the FALLBACK. NPS (park towns) and Google Trends
(primary) override it where available — they write the same crowd_season
column with a higher-priority source tag, run after this.

Raw per-city monthly series for WP + WV (and resolved titles) persist to
Supabase (cities.crowd_raw.wiki) after every city — the source of truth, so we
never re-pull and there's no local cache to go stale.

Usage:
  python3 scripts/measure-crowd-wiki.py            # pull raw → DB + report
  python3 scripts/measure-crowd-wiki.py --write     # also compute blend → crowd_season
  python3 scripts/measure-crowd-wiki.py --refresh   # re-pull even if present

Raw WP/WV series persist to Supabase (cities.crowd_raw.wiki) the instant each
city is pulled — the DB is the source of truth; crowd_season is recomputed
from it. Resume reads crowd_raw from the DB, not a local file.
"""
import json, os, re, statistics, subprocess, sys, time, math, urllib.request, urllib.parse, warnings
warnings.filterwarnings("ignore")
import psycopg2, psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _crowd_db import save_raw   # noqa: E402  (Supabase = source of truth)

UA = "livability-scout/1.0 (tourism-seasonality research; non-commercial)"
WV_TRAFFIC_GATE = 100   # min Wikivoyage peak monthly views to trust it in the blend
SOURCE_BLEND = "wiki_blend_v1(geomean_wp_x_wv_gated)"
SOURCE_WP    = "wiki_wp_only_v1(wikivoyage_below_gate)"

# crowd_intensity for the Wiki tier: per-capita Wikipedia peak views, log-
# scaled against FIXED anchors so it stays a stable ruler as the corpus grows
# (NOT corpus-relative percentiles). WP carries the stable high-traffic
# MAGNITUDE; the WP×WV blend carries SHAPE. Anchors chosen from the observed
# distribution (p10≈128k/M, p50≈453k/M, p90≈2.1M/M): a small tourist town has
# huge per-capita interest → 5; a big city's interest is diluted by population
# → low → the chart mutes its (often contamination-noisy) line. NOTE: this is
# a Wiki-tier-specific intensity basis, distinct from the Trends tier's
# hotel-search per-capita anchors — documented in features/visit-window.md.
WIKI_INTENSITY_FLOOR = 50_000      # per-million-residents WP peak → intensity 0
WIKI_INTENSITY_CEIL  = 3_000_000   # → intensity 5
_WIKI_LOG_RANGE = math.log10(WIKI_INTENSITY_CEIL / WIKI_INTENSITY_FLOOR)

STATES = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado",
"CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois",
"IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland",
"MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana",
"NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York",
"NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania",
"RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah",
"VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"}
MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def _get(url, tries=4):
    """GET JSON with retry on ANY transient failure (404 is terminal → None).
    The action API (api.php) throttles under rapid calls; earlier 'missing
    article' failures were actually swallowed timeouts/throttles, not real
    absences. So retry generously with backoff."""
    delay = 2
    for i in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=25))
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(delay); delay *= 2; continue
        except Exception:
            time.sleep(delay); delay *= 2; continue
    return None


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def resolve_title(api_host, candidates, want):
    """Try each candidate query in order; return first that resolves to a real
    article. `want` is the city name — opensearch results are accepted only if
    they plausibly match it (guards against fuzzy mismatches like
    Greenport→'Greenbo State Resort Park'). Follows redirects to canonical."""
    wn = _norm(want)
    for query in candidates:
        # 1. direct title lookup with redirect resolution
        u = f"https://{api_host}/w/api.php?action=query&titles={urllib.parse.quote(query)}&redirects=1&format=json"
        d = _get(u)
        if d:
            pages = d.get("query", {}).get("pages", {})
            if pages:
                pg = next(iter(pages.values()))
                if "missing" not in pg and pg.get("pageid", 0):
                    return pg["title"].replace(" ", "_")
    for query in candidates:
        # 2. opensearch fallback, but only accept a plausible match
        u = f"https://{api_host}/w/api.php?action=opensearch&search={urllib.parse.quote(query)}&limit=3&namespace=0&format=json"
        d = _get(u)
        if d and len(d) > 1 and d[1]:
            for hit in d[1]:
                if wn and wn in _norm(hit):
                    return hit.replace(" ", "_")
    return None


def title_candidates(city, full):
    """Ordered query candidates for a city, handling slash-names and state."""
    parts = [p.strip() for p in city.split("/")]   # "Carrboro / Chapel Hill"
    cands = []
    for p in parts:
        if full: cands.append(f"{p}, {full}")
        cands.append(p)
        if full: cands.append(f"{p} ({full})")
    # de-dup preserving order
    seen = set(); out = []
    for c in cands:
        if c not in seen: seen.add(c); out.append(c)
    return out, parts[0]


def monthly_views(project, title):
    """[12] median monthly views 2019-2023, or None. Returns (series, peak)."""
    if not title: return None, 0
    u = (f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
         f"{project}/all-access/user/{urllib.parse.quote(title, safe='')}/monthly/2019010100/2024010100")
    d = _get(u)
    if not d or "items" not in d: return None, 0
    by = {m: [] for m in range(1, 13)}
    for it in d["items"]:
        by[int(it["timestamp"][4:6])].append(it["views"])
    series = [statistics.median(by[m]) if by[m] else 0 for m in range(1, 13)]
    return series, int(max(series))


def norm01(v):
    lo, hi = min(v), max(v)
    return [(x - lo) / (hi - lo) if hi > lo else 0 for x in v]

def to5(v):
    lo, hi = min(v), max(v)
    return [round((x - lo) / (hi - lo) * 5) if hi > lo else 0 for x in v]

def wiki_intensity(wp_peak, population):
    """0–5 cross-city magnitude from per-capita WP peak views (log-scaled,
    fixed anchors). None when population unknown."""
    if not population or not wp_peak:
        return None
    percap = wp_peak / population * 1_000_000
    if percap <= WIKI_INTENSITY_FLOOR: return 0
    if percap >= WIKI_INTENSITY_CEIL:  return 5
    return int(round(math.log10(percap / WIKI_INTENSITY_FLOOR) / _WIKI_LOG_RANGE * 5))


def get_secret(n):
    return subprocess.check_output(["security","find-generic-password","-a","livability-scout","-s",n,"-w"]).decode().strip()


def main():
    argv = sys.argv[1:]
    do_write = "--write" in argv
    refresh = "--refresh" in argv
    repair = "--repair" in argv   # re-pull ONLY cities whose WP failed (peak 0 / no title)

    pw = get_secret("supabase-db-password")
    conn = psycopg2.connect(host="aws-1-us-west-2.pooler.supabase.com", port=5432,
        user="postgres.fitjkrmiwkdolxhitroc", password=pw, dbname="postgres", sslmode="require")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""select id,name,population_total,
                          coalesce(crowd_raw,'{}'::jsonb) as crowd_raw
                   from cities where lat is not null order by name""")
    rows = cur.fetchall()

    # Resume state from Supabase (cities.crowd_raw.wiki), not a local file.
    cache = {r["name"]: (r["crowd_raw"].get("wiki") or {}) for r in rows if (r["crowd_raw"] or {}).get("wiki")}
    id_by_name = {r["name"]: r["id"] for r in rows}

    # ── Pull pass: resolve titles + pull WP & WV monthly, persist per city ──
    print(f"PULL: {len(rows)} cities")
    print("-" * 78)
    for r in rows:
        key = r["name"]
        cached = cache.get(key)
        if cached and not refresh:
            # In repair mode, only re-pull entries whose Wikipedia failed.
            if not (repair and not cached.get("wp_peak")):
                continue
        city = re.sub(r"\s*\([^)]+\)\s*", "", key.split(",")[0]).strip()
        st = key.split(",")[1].strip() if "," in key else ""
        full = STATES.get(st, st)
        wp_cands, bare = title_candidates(city, full)
        wv_cands, _ = title_candidates(city, full)
        wp_t = resolve_title("en.wikipedia.org", wp_cands, bare); time.sleep(0.6)
        wv_t = resolve_title("en.wikivoyage.org", wv_cands, bare); time.sleep(0.6)
        wp, wp_pk = monthly_views("en.wikipedia", wp_t); time.sleep(0.3)
        wv, wv_pk = monthly_views("en.wikivoyage", wv_t)
        payload = {"wp_title": wp_t, "wv_title": wv_t, "wp": wp, "wv": wv, "wp_peak": wp_pk, "wv_peak": wv_pk}
        cache[key] = payload
        save_raw(conn, cur, r["id"], "wiki", payload)   # persist to Supabase now
        print(f"  {key:<30} WP={wp_pk:>7} ({wp_t or '—'})   WV={wv_pk:>6} ({wv_t or '—'})")
        time.sleep(0.4)

    # ── Coverage + per-capita distribution report ──
    print("\nCOVERAGE")
    print("-" * 78)
    both = wp_only = neither = 0
    percap = []
    for r in rows:
        e = cache.get(r["name"], {})
        wp_pk, wv_pk = e.get("wp_peak", 0), e.get("wv_peak", 0)
        if wp_pk and wv_pk >= WV_TRAFFIC_GATE: both += 1
        elif wp_pk: wp_only += 1
        else: neither += 1
        if wp_pk and r["population_total"]:
            percap.append(wp_pk / r["population_total"] * 1_000_000)
    print(f"  blend (WP+WV≥{WV_TRAFFIC_GATE}): {both}   WP-only: {wp_only}   neither(null): {neither}")
    if percap:
        percap.sort()
        q = lambda p: percap[int(p*(len(percap)-1))]
        print(f"  WP peak-views per million residents — p10={q(.1):,.0f}  p50={q(.5):,.0f}  p90={q(.9):,.0f}  max={percap[-1]:,.0f}")

    print("\nRaw is persisted to crowd_raw.wiki. Scoring is the master scorer's job:")
    print("  python3 scripts/score-crowd-season.py --write")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
