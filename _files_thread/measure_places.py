#!/usr/bin/env python3
"""
measure_places.py  —  Objective metric extraction for the location model.

Replaces hand-entered 0-10 "vibe" scores with computed measurements.
Run this where you HAVE network access (osmnx/Overpass + an elevation API).

Install:
    pip install osmnx networkx requests numpy pandas

Usage:
    Edit PLACES below (name, lat, lon, radius_m), then:
        python measure_places.py
    Outputs measured_metrics.csv with raw numbers (NOT 0-10 scores).
    The 0-10 banding happens later, consistently, in the scoring step.

What it measures (all objective, all sourced from data, no opinions):
    relief_m          : std-dev of elevation in a grid around core (terrain drama), meters
    feat_water_m      : straight-line distance to nearest significant water (coast/lake/river), m
    feat_relief_max_m : max elevation change within radius (peak prominence proxy), m
    intersection_den  : intersections per km^2 (street-network fineness)
    mean_block_m      : mean street segment length, m (smaller = tighter, more walkable fabric)
    street_km         : total street length in core, km
    carfree_km        : length of pedestrian/living-street/footway segments, km
    carfree_frac      : carfree_km / street_km  (pedestrianization)
    bldg_coverage     : building footprint area / core area (enclosure / density of built fabric)
    cafe_n, rest_n, bar_n, grocery_n, pharmacy_n : POI counts within radius
    daily_needs_n     : grocery + pharmacy + bakery + butcher etc (resident-serving)
"""

import math, json, time
import numpy as np
import pandas as pd

# ----------------------------------------------------------------------
# EDIT THIS LIST. lat/lon = the exact core intersection you'd want to live at.
# radius_m = how big a "core" to measure (600-800m ~ a 10-min walk core).
# ----------------------------------------------------------------------
PLACES = [
    # name,                         lat,        lon,        radius_m
    ("Piran (REF)",                 45.5285,    13.5683,    600),
    ("Bled (REF)",                  46.3683,    14.1133,    700),
    ("Ljubljana (REF)",            46.0510,    14.5060,    700),
    ("Shadyside, Pittsburgh",       40.4530,   -79.9340,    700),
    ("Lawrenceville, Pittsburgh",   40.4660,   -79.9610,    700),
    ("Over-the-Rhine, Cincinnati",  39.1130,   -84.5150,    700),
    ("Tremont, Cleveland",          41.4790,   -81.6890,    700),
    ("Downtown Lancaster PA",       40.0379,   -76.3055,    700),
    # add more here...
]

# ---------- elevation: Open-Elevation (free, no key). Swap for a DEM if you have one. ----------
import requests
def elevation_grid(lat, lon, radius_m, n=7):
    """Sample an n x n grid of elevations around the point; return std and range (meters)."""
    # convert radius to deg
    dlat = radius_m / 111000.0
    dlon = radius_m / (111000.0 * math.cos(math.radians(lat)))
    pts = []
    for i in range(n):
        for j in range(n):
            la = lat - dlat + (2*dlat)*i/(n-1)
            lo = lon - dlon + (2*dlon)*j/(n-1)
            pts.append({"latitude": la, "longitude": lo})
    try:
        r = requests.post("https://api.open-elevation.com/api/v1/lookup",
                          json={"locations": pts}, timeout=30)
        elevs = [d["elevation"] for d in r.json()["results"]]
        return float(np.std(elevs)), float(max(elevs)-min(elevs))
    except Exception as e:
        print("  elevation fail:", e); return None, None

# ---------- OSM street network + buildings + POIs via osmnx ----------
def osm_metrics(lat, lon, radius_m):
    import osmnx as ox
    import networkx as nx
    out = {}
    try:
        G = ox.graph_from_point((lat, lon), dist=radius_m, network_type="all")
        # intersection density
        area_km2 = math.pi * (radius_m/1000.0)**2
        nodes = [n for n,d in G.nodes(data=True)]
        # count true intersections (degree>=3) using undirected
        UG = ox.convert.to_undirected(G)
        inter = sum(1 for n in UG.nodes() if UG.degree(n) >= 3)
        out["intersection_den"] = round(inter/area_km2, 1)
        # street length + mean block
        lengths = [d["length"] for u,v,d in G.edges(data=True) if "length" in d]
        out["street_km"] = round(sum(lengths)/1000.0, 2)
        out["mean_block_m"] = round(float(np.mean(lengths)), 1) if lengths else None
        # car-free length: pedestrian/footway/living_street/pedestrianized
        cf = 0.0
        for u,v,d in G.edges(data=True):
            hw = d.get("highway","")
            hw = hw if isinstance(hw,str) else (hw[0] if hw else "")
            if hw in ("pedestrian","footway","living_street","path","steps") or d.get("foot")=="designated":
                cf += d.get("length",0)
        out["carfree_km"] = round(cf/1000.0, 2)
        out["carfree_frac"] = round(cf/sum(lengths), 3) if lengths else None
    except Exception as e:
        print("  osm graph fail:", e)
    # buildings -> coverage
    try:
        gdf = ox.features_from_point((lat,lon), tags={"building":True}, dist=radius_m)
        proj = ox.projection.project_gdf(gdf)
        area_core = math.pi * radius_m**2
        out["bldg_coverage"] = round(float(proj.geometry.area.sum())/area_core, 3)
    except Exception as e:
        print("  buildings fail:", e); out["bldg_coverage"]=None
    # POIs
    try:
        tags = {"amenity":["cafe","restaurant","bar","pub","pharmacy"],
                "shop":["bakery","butcher","greengrocer","supermarket","convenience"]}
        p = ox.features_from_point((lat,lon), tags=tags, dist=radius_m)
        def cnt(col,vals):
            if col not in p.columns: return 0
            return int(p[col].isin(vals).sum())
        out["cafe_n"]    = cnt("amenity",["cafe"])
        out["rest_n"]    = cnt("amenity",["restaurant"])
        out["bar_n"]     = cnt("amenity",["bar","pub"])
        out["pharmacy_n"]= cnt("amenity",["pharmacy"])
        out["grocery_n"] = cnt("shop",["supermarket","convenience","greengrocer"])
        out["daily_needs_n"] = out["grocery_n"]+out["pharmacy_n"]+cnt("shop",["bakery","butcher"])
    except Exception as e:
        print("  poi fail:", e)
    return out

def nearest_water_m(lat, lon, radius_m=8000):
    """Distance to nearest significant water via Overpass."""
    import requests
    q = f"""
    [out:json][timeout:25];
    (way["natural"="water"](around:{radius_m},{lat},{lon});
     way["natural"="coastline"](around:{radius_m},{lat},{lon});
     relation["natural"="water"](around:{radius_m},{lat},{lon}););
    out center 1;"""
    try:
        r=requests.post("https://overpass-api.de/api/interpreter",data=q,timeout=30).json()
        best=None
        for el in r.get("elements",[]):
            c=el.get("center") or {"lat":el.get("lat"),"lon":el.get("lon")}
            if c.get("lat") is None: continue
            d=haversine(lat,lon,c["lat"],c["lon"])
            best=d if best is None else min(best,d)
        return round(best) if best is not None else None
    except Exception as e:
        print("  water fail:",e); return None

def haversine(a,b,c,d):
    R=6371000;p=math.radians
    dphi=p(c-a);dl=p(d-b)
    x=math.sin(dphi/2)**2+math.cos(p(a))*math.cos(p(c))*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(x))

def main():
    rows=[]
    for name,lat,lon,rad in PLACES:
        print("measuring:",name)
        row={"place":name,"lat":lat,"lon":lon,"radius_m":rad}
        std,rng=elevation_grid(lat,lon,rad); row["relief_std_m"]=std; row["relief_range_m"]=rng
        row["water_dist_m"]=nearest_water_m(lat,lon)
        row.update(osm_metrics(lat,lon,rad))
        rows.append(row); time.sleep(1)  # be polite to public APIs
    df=pd.DataFrame(rows)
    df.to_csv("measured_metrics.csv",index=False)
    print("\nwrote measured_metrics.csv")
    print(df.to_string(index=False))

if __name__=="__main__":
    main()
