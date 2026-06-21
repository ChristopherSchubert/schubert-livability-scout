#!/usr/bin/env python3
"""
v2: cross-city comparison + population normalization.

Fix for the Pittsburgh-vs-Newport problem the within-city scaling has:
both look "seasonal" because we min-max within each city, when really
Pittsburgh has a high flat floor of business travel and Newport is
nearly empty off-season.

Method:
  1. Google Trends `compare` query (up to 5 terms in one payload, all
     normalized against each other on a single 0-100 scale).
  2. Divide each month's interest by city population to get
     tourist-search-per-resident — a real "tourist intensity" number.
  3. Show both the raw absolute interest and the per-capita version
     so we can see the difference.
"""
import warnings, statistics, time
warnings.filterwarnings("ignore")
from pytrends.request import TrendReq

# city -> approx city-proper population (will move to Census later)
CITIES = {
    "Pittsburgh":     302_000,
    "Newport":         25_000,   # RI
    "Bar Harbor":       5_000,
    "Asheville":       95_000,
    "Santa Barbara":   88_000,
}

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def fetch_compare(cities):
    """One compare query for all cities; returns {city: [12 medians 0-100]}."""
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


def render(city, raw, pop):
    per_cap = [r / pop * 1_000_000 for r in raw]  # per-million-residents
    print(f"\n{city}  (pop {pop:,})")
    print("  raw absolute (cross-city scale): " + "  ".join(f"{r:>4.1f}" for r in raw))
    print(f"     range: {min(raw):.1f}–{max(raw):.1f}   span: {max(raw)-min(raw):.1f}")
    print("  per-million-residents:           " + "  ".join(f"{r:>4.1f}" for r in per_cap))
    print(f"     range: {min(per_cap):.1f}–{max(per_cap):.1f}   peak: {max(per_cap):.1f}")


def main():
    cities = list(CITIES.keys())
    print(f"Fetching compare query for: {cities}")
    raw = fetch_compare(cities)
    for c in cities:
        render(c, raw[c], CITIES[c])

    # The headline number for the chart:
    print("\n\nTOURIST INTENSITY RANKING  (peak per-million-residents)")
    print("=" * 60)
    intensities = []
    for c in cities:
        peak_pc = max(raw[c]) / CITIES[c] * 1_000_000
        intensities.append((c, peak_pc))
    intensities.sort(key=lambda x: -x[1])
    for c, i in intensities:
        bar = "█" * min(40, int(i / max(j for _, j in intensities) * 40))
        print(f"  {c:<18} {i:>8.1f}  {bar}")


if __name__ == "__main__":
    main()
