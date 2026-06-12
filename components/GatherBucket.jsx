"use client";

// GatherBucket — the Gather phase (#25). For a leg, browse the local pois cache
// near that city (Google Places, cached — same source as the walking-core
// measure) and save a candidate straight into the trip as an entry with its
// real place_id resolved. Ranked by rating × log(reviews). No Google call —
// reads the cache the browser can see (pois RLS is off).
import { useState } from "react";
import { useTrips } from "./TripProvider";
import { usePlanner } from "./PlannerProvider";
import { getSupabase } from "../lib/supabase";
import { CAT_ICON } from "./atoms";

// Google primary_type → v2 category (the buckets a suggestion can become).
const TYPE_CAT = {
  restaurant: "meal", cafe: "meal", coffee_shop: "meal", bakery: "meal",
  ice_cream_shop: "meal", meal_takeaway: "meal", bar: "activity", pub: "activity",
  grocery_store: "errand", supermarket: "errand", pharmacy: "errand", market: "errand",
};
function catFor(t) {
  if (TYPE_CAT[t]) return TYPE_CAT[t];
  if (typeof t === "string" && t.endsWith("_restaurant")) return "meal";
  return "activity";
}

export default function GatherBucket({ trip, leg }) {
  const { addEntry } = useTrips();
  const { planner } = usePlanner();
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({});

  const city = planner.cities.find((c) => c.id === leg.cityId);
  const cityName = (leg.name || city?.name || "").split(",")[0];

  async function browse() {
    setOpen(true);
    if (cands || !city?.lat) return;
    setBusy(true);
    try {
      const sb = getSupabase();
      const dLat = 1500 / 111320, dLon = 1500 / (111320 * Math.cos((city.lat * Math.PI) / 180));
      const { data, error } = await sb.from("pois")
        .select("place_id,name,lat,lon,primary_type,rating,user_rating_count")
        .gte("lat", city.lat - dLat).lte("lat", city.lat + dLat)
        .gte("lon", city.lon - dLon).lte("lon", city.lon + dLon)
        .not("business_status", "eq", "CLOSED_PERMANENTLY")
        .order("user_rating_count", { ascending: false, nullsFirst: false }).limit(60);
      if (error) throw error;
      const ranked = (data || [])
        .map((p) => ({ ...p, score: (p.rating || 0) * Math.log10((p.user_rating_count || 0) + 1) }))
        .sort((a, b) => b.score - a.score).slice(0, 12);
      setCands(ranked);
    } catch (e) {
      console.error("browse failed:", e.message);
      setCands([]);
    } finally {
      setBusy(false);
    }
  }

  async function save(p) {
    setSaved((s) => ({ ...s, [p.place_id]: "saving" }));
    // Saved candidates land UNDATED on the Shelf (the pool) — gather first,
    // lay out onto days later (Solve / place). The deck's Gather → Lay out flow.
    const e = await addEntry(trip.id, {
      day: null, role: "anchor", category: catFor(p.primary_type), status: "none",
      title: p.name, time: { mode: "bucket", bucket: "flex" }, legHint: leg.cityId || null,
      place: { placeId: p.place_id, name: p.name, lat: p.lat, lon: p.lon },
    });
    setSaved((s) => ({ ...s, [p.place_id]: e ? "saved" : "err" }));
  }

  return (
    <div className="gb">
      <button className="gb-trigger" onClick={() => (open ? setOpen(false) : browse())} disabled={!city?.lat}>
        🔍 {open ? "Hide" : "Browse"} {cityName} suggestions
        {!city?.lat ? <em> (no coords)</em> : null}
      </button>
      {open ? (
        busy ? <p className="gb-busy">searching the cache…</p> : (
          <div className="gb-cards">
            {(cands || []).length === 0 ? <p className="gb-busy">no cached suggestions here.</p> :
              cands.map((p) => {
                const cat = catFor(p.primary_type);
                const st = saved[p.place_id];
                return (
                  <div key={p.place_id} className={`gb-card cat-${cat}`}>
                    <b>{CAT_ICON[cat]} {p.name}</b>
                    <small>{p.rating ? `★${p.rating}` : ""}{p.user_rating_count ? ` (${p.user_rating_count.toLocaleString()})` : ""}{p.primary_type ? ` · ${p.primary_type.replace(/_/g, " ")}` : ""}</small>
                    <button className={`gb-save${st === "saved" ? " done" : ""}`} disabled={!!st}
                            onClick={() => save(p)}>
                      {st === "saved" ? "✓ saved" : st === "saving" ? "…" : "+ save"}
                    </button>
                  </div>
                );
              })}
          </div>
        )
      ) : null}
    </div>
  );
}
