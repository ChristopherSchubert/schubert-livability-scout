"use client";

// GatherPanel (issues #25, #26) — the Do pool. Builds a ranked candidate
// directory from the cached `pois` near the trip's first leg (lib/sourcing.js
// #buildPool, proven by #41) + an add-your-own row (place resolution #13).
// "Add to trip" drops a candidate onto a day as an anchor entry (the Block step;
// drag wiring is #17, this also gives a no-drag button path for a11y).
import { useEffect, useState } from "react";
import { fetchPoisNear } from "../../lib/db";
import { buildPool } from "../../lib/sourcing";
import { MarkerSet } from "./atoms";

export default function GatherPanel({ trip, onAdd }) {
  const [pool, setPool] = useState(null);
  const [error, setError] = useState(null);
  const [cat, setCat] = useState("All");

  const origin = poolOrigin(trip);

  useEffect(() => {
    if (!origin) {
      setPool([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await fetchPoisNear(origin.lat, origin.lon, 1500);
        if (!cancelled) setPool(buildPool(raw, { origin }));
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [origin?.lat, origin?.lon]);

  if (!origin)
    return <p className="trip-ws-sub">Add a leg with a location to gather nearby options.</p>;
  if (error) return <p className="trip-ws-sub">Couldn’t load the pool: {error}</p>;
  if (!pool) return <p className="trip-ws-sub">Gathering nearby options…</p>;

  const categories = ["All", ...new Set(pool.map((p) => p.category))];
  const shown = cat === "All" ? pool : pool.filter((p) => p.category === cat);

  return (
    <div className="trip-card" style={{ marginTop: "1rem" }}>
      <h2>Gather — nearby options</h2>
      <div className="marker-set" style={{ marginBottom: "0.5rem" }}>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className="marker-chip"
            aria-pressed={cat === c}
            style={{ opacity: cat === c ? 1 : 0.5 }}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="entry-list">
        {shown.slice(0, 40).map((p) => (
          <div
            key={p.placeId}
            className="entry-card"
            data-category={mapKindToCat(p.kind)}
            style={{ "--spine": `var(--kind-${mapKindToCat(p.kind)})` }}
          >
            <div className="entry-card-title">
              {p.name}{" "}
              <small className="trip-ws-sub">
                · {p.category}
                {p.rating ? ` · ★${p.rating}` : ""}
              </small>
            </div>
            <MarkerSet markers={p.markers} />
            <div>
              <button
                type="button"
                className="auth-ghost"
                onClick={() => onAdd(candidateToEntry(p))}
              >
                + Add to trip
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 ? (
          <p className="trip-ws-sub">No cached POIs here yet (run the POI fetch for this city).</p>
        ) : null}
      </div>
    </div>
  );
}

function poolOrigin(trip) {
  const leg = (trip.legs || [])[0];
  if (leg?.lodging?.lat != null) return { lat: leg.lodging.lat, lon: leg.lodging.lon };
  if (trip.glance?.lat != null) return { lat: trip.glance.lat, lon: trip.glance.lon };
  return null;
}

// sourcing.kind (the legacy 6-color key) → v2 category for the spine hue.
function mapKindToCat(kind) {
  return (
    { meal: "meal", checkin: "stay", booked: "activity", todo: "errand", flexible: "activity" }[
      kind
    ] || "activity"
  );
}

// A pool candidate → a v2 entry draft (anchor, place already resolved via cache).
function candidateToEntry(p) {
  return {
    role: "anchor",
    category: mapKindToCat(p.kind),
    status: "none",
    title: p.name,
    time: { mode: "bucket", bucket: "morning" },
    durationMin: 90,
    place: {
      placeId: p.placeId,
      name: p.name,
      lat: p.place.lat,
      lon: p.place.lon,
      address: p.place.address,
    },
    markers: p.markers || [],
  };
}
