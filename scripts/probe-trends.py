#!/usr/bin/env python3
"""
Probe Google Trends as a candidate source for `crowd_season`.

For each city in CITIES:
  - Pull 5 years of weekly "<city> hotels" interest
  - Roll up to a per-calendar-month median (suppresses one-off spikes)
  - Min-max scale within the city to 0–5 (seasonality SHAPE, not magnitude)

Prints a 12-month line per city so we can eyeball whether the curves look
honest (tourist towns peak in summer / their high season; year-round cities
look flat).

This is a PROBE, not a measurer. If the output looks reasonable we'll wrap
it as `lib/measurers/crowd-season.js`.
"""

import sys
import time
import statistics
from pytrends.request import TrendReq

# Mix of cities chosen to falsify the method:
#   - Santa Barbara: clear summer-tourist peak (we have a hand-set seed to compare)
#   - Savannah: spring peak (St Patrick's), summer slump
#   - Bar Harbor: extreme summer-only (Acadia gateway)
#   - Asheville: fall peak (leaf season)
#   - Annapolis: summer + fall (sailing + USNA football)
#   - Pittsburgh: should be flat — not a tourist town
CITIES = [
    "Santa Barbara",
    "Savannah",
    "Bar Harbor",
    "Asheville",
    "Annapolis",
    "Pittsburgh",
]

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def fetch_monthly(city: str):
    """Return list[12] of medians 0-100, or None if Trends has no data."""
    pytrends = TrendReq(hl="en-US", tz=300, timeout=(10, 25))
    query = f"{city} hotels"
    # 5y weekly data, US only (so signal isn't diluted by global searchers)
    pytrends.build_payload([query], cat=0, timeframe="today 5-y", geo="US")
    df = pytrends.interest_over_time()
    if df is None or df.empty:
        return None
    series = df[query]
    by_month = {m: [] for m in range(1, 13)}
    for ts, val in series.items():
        by_month[ts.month].append(int(val))
    months = []
    for m in range(1, 13):
        vals = by_month[m]
        months.append(statistics.median(vals) if vals else None)
    return months


def scale_to_0_5(monthly):
    """Min-max scale within-city. Floor span at 5 so flat cities don't get
    amplified into spurious seasonality."""
    vals = [v for v in monthly if v is not None]
    if not vals:
        return [None] * 12
    lo, hi = min(vals), max(vals)
    span = max(hi - lo, 5)  # never amplify a < 5pt range into a full 0-5 swing
    out = []
    for v in monthly:
        if v is None:
            out.append(None)
        else:
            out.append(round((v - lo) / span * 5))
    return out


def render(city: str, raw, scaled):
    print(f"\n{city}")
    print("  raw : " + "  ".join(f"{m}={r:>3}" if r is not None else f"{m}= - " for m, r in zip(MONTHS, raw)))
    print("  0-5 : " + "  ".join(f"{m}={s}" if s is not None else f"{m}=-" for m, s in zip(MONTHS, scaled)))
    # ASCII sparkline of the 0-5 curve
    blocks = " ▁▂▃▅▆█"
    spark = "".join(blocks[s] if s is not None else "·" for s in scaled)
    print(f"  shape: {spark}")


def main():
    for city in CITIES:
        try:
            raw = fetch_monthly(city)
        except Exception as e:
            print(f"\n{city}\n  ERROR: {e}")
            continue
        if raw is None:
            print(f"\n{city}\n  (no data from Trends)")
            continue
        scaled = scale_to_0_5(raw)
        render(city, raw, scaled)
        time.sleep(3)  # be polite — anti-bot kicks in fast otherwise


if __name__ == "__main__":
    sys.exit(main())
