#!/usr/bin/env python3
"""
v3: validate the anchor by probing extreme tourist destinations.

Runs in two passes so a rate-limit in pass 2 doesn't lose pass 1's data.
Cache lives at scripts/.trends-cache.json. Run twice with a long wait
between to populate both batches, then a third time to render.
"""
import warnings, statistics, json, os, sys, time
warnings.filterwarnings("ignore")
from pytrends.request import TrendReq

POPS = {
    "Bar Harbor":      5_089,
    "Mackinac Island":   583,
    "Provincetown":    2_961,
    "Aspen":           7_004,
    "Stowe":           5_204,
    "Key West":       26_191,
    "Sedona":         10_336,
    "Carmel":          3_867,
}

BATCHES = {
    "b1": ["Bar Harbor", "Mackinac Island", "Provincetown", "Aspen", "Stowe"],
    "b2": ["Bar Harbor", "Key West", "Sedona", "Carmel"],
}

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
CACHE = os.path.join(os.path.dirname(__file__), ".trends-cache.json")


def fetch(cities):
    queries = [f"{c} hotels" for c in cities]
    p = TrendReq(hl="en-US", tz=300, timeout=(10, 30))
    p.build_payload(queries, timeframe="today 5-y", geo="US")
    df = p.interest_over_time()
    out = {}
    for c, q in zip(cities, queries):
        by = {m: [] for m in range(1, 13)}
        for ts, v in df[q].items():
            by[ts.month].append(int(v))
        out[c] = [statistics.median(by[m]) for m in range(1, 13)]
    return out


def load_cache():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    return {}


def save_cache(d):
    json.dump(d, open(CACHE, "w"), indent=2)


def render(cache):
    if "b1" not in cache or "b2" not in cache:
        print(f"Need both batches first. Have: {list(cache.keys())}")
        return

    b1 = cache["b1"]
    b2_raw = cache["b2"]
    bh1, bh2 = max(b1["Bar Harbor"]), max(b2_raw["Bar Harbor"]) or 1
    scale = bh1 / bh2
    b2 = {c: [v * scale for v in vs] for c, vs in b2_raw.items()}
    print(f"Cross-batch rescale (BH-b1 / BH-b2): {scale:.2f}")

    all_raw = {**b1, **{c: b2[c] for c in BATCHES["b2"] if c != "Bar Harbor"}}

    intensities = []
    for c, raw in all_raw.items():
        per_cap = [r / POPS[c] * 1_000_000 for r in raw]
        intensities.append((c, max(per_cap), per_cap, raw))
    intensities.sort(key=lambda x: -x[1])

    top = intensities[0][1]
    print("\nPEAK TOURIST INTENSITY  (per million residents)")
    print("=" * 70)
    for c, peak, per_cap, raw in intensities:
        bar = "█" * int(peak / top * 50)
        print(f"  {c:<18} pop {POPS[c]:>6,}   peak {peak:>8,.0f}  {bar}")

    print("\nMONTHLY SHAPE  (per-million-residents)")
    print("=" * 70)
    print(f"  {'':<18} " + "  ".join(f"{m:>5}" for m in MONTHS))
    for c, peak, per_cap, raw in intensities:
        print(f"  {c:<18} " + "  ".join(f"{v:>5.0f}" for v in per_cap))


def main():
    cache = load_cache()
    if len(sys.argv) > 1 and sys.argv[1] == "render":
        render(cache)
        return
    for key, cities in BATCHES.items():
        if key in cache:
            print(f"{key}: cached, skip")
            continue
        print(f"{key}: fetching {cities}")
        try:
            cache[key] = fetch(cities)
            save_cache(cache)
            print(f"{key}: ok, saved")
        except Exception as e:
            print(f"{key}: FAILED — {e}")
            return
        time.sleep(45)
    render(cache)


if __name__ == "__main__":
    main()
