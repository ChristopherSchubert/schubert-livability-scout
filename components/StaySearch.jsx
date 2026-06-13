"use client";

// StaySearch — hotel search panel for an empty stay slot (Janice feedback #5,
// deck STAYS phase). Props: { trip, leg, onPlaced }.
//
// Calls /api/places/search with rich:true so each result card carries a
// googleMapsUri for "↗ photos & reviews" — Janice's single most-cared-about
// ask: she pours over Google reviews and photos before picking a hotel.
//
// ⛔ DATA RULE: never invent data. Rating / userRatingCount are only shown
// when Google returns them. Booking fields (confirmation, cancel-by, etc.)
// stay blank/null — the caller opens EntryEditor for those after placement.
//
// follow-up: drag-onto-segment (drop hotel bar onto the stays row) is OUT of
// scope for this pass — see features/trip-planner-components.md.
// follow-up: split-a-stay (✂ split one leg into two stays) is also OUT.

import { useState } from "react";
import { useTrips } from "./TripProvider";

// Extract the city name from "City, State, Country"-style leg names.
function cityName(leg) {
  return (leg?.name || "").split(",")[0].trim() || "this city";
}

// Build the Google Maps search fallback URL for a candidate that has no
// googleMapsUri (e.g. when it came from the default field mask somehow).
function mapsUrl(candidate) {
  if (candidate.googleMapsUri) return candidate.googleMapsUri;
  const q = encodeURIComponent([candidate.name, candidate.address].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function StaySearch({ trip, leg, onPlaced }) {
  const { addEntry } = useTrips();
  const defaultQuery = `hotels in ${cityName(leg)}`;
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [placing, setPlacing] = useState(null); // placeId being placed

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setErr("");
    setResults([]);
    try {
      const r = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, rich: true, limit: 8,
          near: leg.lat != null ? { lat: leg.lat, lon: leg.lon } : undefined }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setResults(j.results || []);
    } catch (e) {
      setErr(e.message || "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function placeStay(candidate) {
    setPlacing(candidate.placeId);
    try {
      const title = `Stay — ${candidate.name}`;
      const saved = await addEntry(trip.id, {
        category: "stay",
        status: "reserved",
        role: "connective",
        day: leg.arrive,
        title,
        place: {
          placeId: candidate.placeId,
          name: candidate.name,
          lat: candidate.lat,
          lon: candidate.lon,
          address: candidate.address || null,
        },
      });
      if (saved && onPlaced) onPlaced(saved);
    } finally {
      setPlacing(null);
    }
  }

  return (
    <div className="ss-wrap">
      <div className="ss-bar">
        <input
          className="ss-input"
          value={query}
          placeholder="search hotels near the leg…"
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          aria-label="Hotel search query"
        />
        <button className="ss-go" onClick={runSearch} disabled={busy} aria-label="Search">
          {busy ? "…" : "Search"}
        </button>
      </div>
      {err ? <p className="ss-err">{err}</p> : null}
      {!err && results.length === 0 && !busy ? (
        <p className="ss-hint">
          results from Google Places · rated by reviews · open any for photos &amp; full reviews
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="ss-results" role="list">
          {results.map((c) => (
            <li key={c.placeId} className="ss-card">
              <div className="ss-card-body">
                <b className="ss-name">{c.name}</b>
                {c.rating != null ? (
                  <span className="ss-rating">
                    ★{c.rating.toFixed(1)}
                    {c.userRatingCount != null ? (
                      <span className="ss-rcount"> ({c.userRatingCount.toLocaleString()})</span>
                    ) : null}
                  </span>
                ) : null}
                {c.address ? <small className="ss-addr">{c.address}</small> : null}
              </div>
              <div className="ss-card-acts">
                <a
                  className="ss-glink"
                  href={mapsUrl(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${c.name} on Google Maps for photos and reviews`}
                >
                  ↗ photos &amp; reviews
                </a>
                <button
                  className="ss-use"
                  disabled={placing === c.placeId}
                  onClick={() => placeStay(c)}
                  aria-label={`Use ${c.name} as stay for ${cityName(leg)}`}
                >
                  {placing === c.placeId ? "Placing…" : "＋ use this stay"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
