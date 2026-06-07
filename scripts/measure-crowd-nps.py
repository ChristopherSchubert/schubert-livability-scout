#!/usr/bin/env python3
"""
crowd_season — NPS ground-truth override (top tier of the cascade).

For the handful of towns where a National Park Service unit's visitors ARE the
town's tourists on the same trip, the unit's monthly recreation-visit counts
(TRV) are actual presence data — strictly better than the Trends/Wikipedia
interest proxies. This script overrides crowd_season (the SHAPE) for those
towns with the NPS curve. crowd_intensity (magnitude) is left as the Wiki tier
set it — all these towns are high-tourism by selection.

Curation rule: include a town only if the unit is in-town or immediately
adjacent AND its visitors overlap the town's tourist pool. The mapping is
written to cities.nps_unit_code (provenance on the row); seasonality is then
computed from that column + data/nps/visitation_main.csv. Rejected, e.g.,
Annapolis→Fort McHenry (Baltimore's fort, different pool) and New Castle→
First State NHP (visitation spread across many DE/PA sites — too diffuse).

Usage:
  python3 scripts/measure-crowd-nps.py            # set mapping + report shapes
  python3 scripts/measure-crowd-nps.py --write     # also override crowd_season
"""
import csv, json, statistics, subprocess, sys, os, warnings
warnings.filterwarnings("ignore")
import psycopg2, psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _crowd_db import save_raw   # noqa: E402  (Supabase = source of truth)

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "nps", "visitation_main.csv")
MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
SOURCE = "nps_trv_v1"   # + ":<UNITCODE>"

# One-time curation: town (exact corpus name) → (NPS unit code, why).
# Used only to populate cities.nps_unit_code; runtime reads the column.
CURATED = {
    "St. Augustine, FL": ("CASA", "Castillo de San Marcos is in town — the signature attraction"),
    "Charleston, SC":    ("FOSU", "Fort Sumter — boat tour from the downtown waterfront"),
    "Savannah, GA":      ("FOPU", "Fort Pulaski — standard Savannah day-trip"),
    "Salem, MA":         ("SAMA", "Salem Maritime NHS is in Salem"),
    "Manteo, NC":        ("FORA", "Fort Raleigh / Lost Colony — on Roanoke Island with Manteo"),
    "Astoria, OR":       ("LEWI", "Lewis & Clark NHP (Fort Clatsop) — adjacent to Astoria"),
}


def nps_shape(code):
    by = {m: [] for m in range(1, 13)}
    with open(CSV_PATH) as f:
        for row in csv.reader(f):
            if len(row) < 5:
                continue
            u, yr, mo, stat, val = row
            if u == code and stat == "TRV" and yr.isdigit() and 2019 <= int(yr) <= 2023:
                try: by[int(mo)].append(int(val))
                except ValueError: pass
    med = [int(statistics.median(by[m])) if by[m] else 0 for m in range(1, 13)]
    if max(med) == 0:
        return None, None, None
    lo, hi = min(med), max(med)
    shape = [round((v - lo) / (hi - lo) * 5) for v in med]
    return shape, MONTHS[med.index(hi)], med   # med = raw monthly TRV series


def get_secret(n):
    return subprocess.check_output(["security","find-generic-password","-a","livability-scout","-s",n,"-w"]).decode().strip()


def main():
    do_write = "--write" in sys.argv[1:]
    pw = get_secret("supabase-db-password")
    conn = psycopg2.connect(host="aws-1-us-west-2.pooler.supabase.com", port=5432,
        user="postgres.fitjkrmiwkdolxhitroc", password=pw, dbname="postgres", sslmode="require")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print(f"{'city':<20}{'unit':<7}{'NPS peak':<10}{'shape':<28}{'action'}")
    print("-" * 80)
    overridden = 0
    for name, (code, why) in CURATED.items():
        # 1) verify the city exists, set provenance column
        cur.execute("select id from cities where name=%s", (name,))
        row = cur.fetchone()
        if not row:
            print(f"{name:<20}{code:<7}— city not in corpus, skipping")
            continue
        shape, peak, trv = nps_shape(code)
        if shape is None:
            print(f"{name:<20}{code:<7}NO NPS DATA — skipping")
            continue
        if do_write:
            # Persist the raw TRV series to crowd_raw.nps (source of truth),
            # plus the derived shape + provenance unit code.
            save_raw(conn, cur, row["id"], "nps", {"unit": code, "trv": trv})
            cur.execute(
                "update cities set nps_unit_code=%s, crowd_season=%s::jsonb, crowd_season_source=%s where id=%s",
                (code, json.dumps(shape), f"{SOURCE}:{code}", row["id"]))
            conn.commit()
            overridden += 1
            action = "WROTE override"
        else:
            action = "(dry-run)"
        print(f"{name:<20}{code:<7}{peak:<10}{str(shape):<28}{action}")

    print("-" * 80)
    print(f"{'wrote' if do_write else 'would write'} {overridden if do_write else len(CURATED)} NPS overrides"
          + ("" if do_write else "  — re-run with --write"))
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
