#!/usr/bin/env python3
"""
THE master scorer for crowd_season — the ONLY thing that writes the
crowd_season / crowd_intensity / crowd_season_source columns.

Measurers (measure-crowd-{wiki,nps,season}.py) are pure data collectors: they
write raw signals into cities.crowd_raw and nothing else. This script reads
crowd_raw, applies the cascade precedence, and computes the final score. So
the score is always a deterministic function of crowd_raw (which lives in the
DB), and no measurer can overwrite a higher tier's result.

Cascade (highest available tier wins for the SHAPE):
  1. nps    — ground-truth recreation visits (crowd_raw.nps.trv)
  2. trends — Google Trends blend, but only when BOTH templates are present
  3. wiki   — Wikipedia×Wikivoyage blend (the universal fallback)

Run it any time raw changes (after any measurer run):
  python3 scripts/score-crowd-season.py            # report what would change
  python3 scripts/score-crowd-season.py --write     # write the scores
"""
import math, sys, statistics
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from _crowd_db import connect, load_cities, save_season
import psycopg2.extras

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# ── Trends config (mirrors measure-crowd-season.py; scoring lives here now) ──
TRENDS_METHOD = "gtrends_pop_norm_v3_blend(hotels:lead=1m:w=0.4|things_to_do:lead=0:w=0.6)_anchor=myrtle_beach"
TRENDS_TEMPLATES = [("hotels", 1, 0.4), ("things_to_do", 0, 0.6)]  # key, lead_months, weight
TRENDS_FLOOR, TRENDS_CEIL = 100, 10_000

# ── Wiki config ──
WV_GATE = 100
WIKI_FLOOR, WIKI_CEIL = 50_000, 3_000_000


def norm01(v):
    lo, hi = min(v), max(v)
    return [(x - lo) / (hi - lo) if hi > lo else 0 for x in v]

def to5(v):
    lo, hi = min(v), max(v)
    return [round((x - lo) / (hi - lo) * 5) if hi > lo else 0 for x in v]

def shape_within_city(per_million):
    vals = [x for x in per_million if x]
    if not vals:
        return [0] * 12
    lo, hi = min(vals), max(vals)
    span = hi - lo
    MIN_SPAN = 100 * 0.25
    scale_to = 5 if span >= MIN_SPAN else 5 * (span / MIN_SPAN if MIN_SPAN else 0)
    return [0 if v is None or span <= 0 else int(round((v - lo) / span * scale_to)) for v in per_million]

def log_intensity(peak, floor, ceil):
    if not peak or peak <= floor:
        return 0
    if peak >= ceil:
        return 5
    return int(round(math.log10(peak / floor) / math.log10(ceil / floor) * 5))

def shift_forward(curve, months):
    if not months:
        return list(curve)
    return [curve[(m - months) % 12] for m in range(12)]


# ── Per-tier scorers: (shape, intensity, source) or None if tier unavailable ──

def score_nps(raw, wiki_intensity):
    nps = raw.get("nps")
    if not nps or not nps.get("trv") or max(nps["trv"]) == 0:
        return None
    # Shape from ground-truth visits; magnitude (intensity) borrowed from the
    # Wiki per-capita basis when available (NPS visit counts aren't on the same
    # cross-city ruler), else None.
    return to5(nps["trv"]), wiki_intensity, f"nps_trv_v1:{nps.get('unit','?')}"

def score_trends(raw, pop, ref_peak):
    tr = raw.get("trends") or {}
    if not all(k in tr for k, _, _ in TRENDS_TEMPLATES):
        return None  # need BOTH templates for a full v3 blend
    if not pop:
        return None
    blended = [0.0] * 12
    wsum = 0.0
    for key, lead, weight in TRENDS_TEMPLATES:
        e = tr[key]
        anchor_pk = max(e["anchor"]) or 1
        scale = ref_peak / anchor_pk
        pm = [(v or 0) * scale / pop * 1_000_000 for v in e["city"]]
        pm = shift_forward(pm, lead)
        for m in range(12):
            blended[m] += pm[m] * weight
        wsum += weight
    blended = [v / wsum for v in blended]
    return shape_within_city(blended), log_intensity(max(blended), TRENDS_FLOOR, TRENDS_CEIL), TRENDS_METHOD

def wiki_parts(raw, pop):
    """Return (shape, intensity, source) for the wiki tier, or None."""
    w = raw.get("wiki")
    if not w or not w.get("wp") or not w.get("wp_peak"):
        return None
    wp, wv = w["wp"], w.get("wv")
    wp_pk, wv_pk = w["wp_peak"], w.get("wv_peak", 0)
    if wv and wv_pk >= WV_GATE:
        wpn, wvn = norm01(wp), norm01(wv)
        shape = to5([math.sqrt(wpn[i] * wvn[i]) for i in range(12)])
        src = "wiki_blend_v1(geomean_wp_x_wv_gated)"
    else:
        shape = to5(norm01(wp))
        src = "wiki_wp_only_v1(wikivoyage_below_gate)"
    intensity = log_intensity(wp_pk / pop * 1_000_000, WIKI_FLOOR, WIKI_CEIL) if pop else None
    return shape, intensity, src


def main():
    do_write = "--write" in sys.argv[1:]
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    rows = load_cities(cur)

    # Global Trends reference anchor: strongest anchor peak across all cities'
    # crowd_raw.trends (Myrtle dominates ~every pairing, so ≈100). Deterministic
    # from the DB; no separate calibration file needed for scoring.
    ref_peak = 1
    for r in rows:
        for key, _, _ in TRENDS_TEMPLATES:
            e = (r["crowd_raw"].get("trends") or {}).get(key)
            if e and e.get("anchor"):
                ref_peak = max(ref_peak, max(e["anchor"]))

    tiers = {"nps": 0, "trends": 0, "wiki": 0, "null": 0}
    changed = 0
    for r in rows:
        raw = r["crowd_raw"] or {}
        pop = r["population_total"]
        wiki = wiki_parts(raw, pop)
        wiki_intensity = wiki[1] if wiki else None

        # Cascade: NPS > Trends (full) > Wiki
        result = (score_nps(raw, wiki_intensity)
                  or score_trends(raw, pop, ref_peak)
                  or wiki)
        if result is None:
            tiers["null"] += 1
            continue
        shape, intensity, source = result
        tier = source.split(":")[0].split("(")[0].replace("_v1", "").replace("gtrends_pop_norm_v3_blend", "trends")
        tier = "nps" if source.startswith("nps") else ("trends" if source.startswith("gtrends") else "wiki")
        tiers[tier] += 1

        if (r["crowd_season"] != shape or r["crowd_season_source"] != source
                or r["crowd_intensity"] != intensity):
            changed += 1
            if do_write:
                save_season(conn, cur, r["id"], shape, source, intensity)

    print(f"tiers: nps={tiers['nps']}  trends={tiers['trends']}  wiki={tiers['wiki']}  null={tiers['null']}")
    print(f"{'wrote' if do_write else 'would change'} {changed} cities"
          + ("" if do_write else "  — re-run with --write"))
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
