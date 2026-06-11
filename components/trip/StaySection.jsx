"use client";

// StaySection (issue #24) — lodging, booked first. Per-leg candidate stays
// (shortlist) + the chosen one; book graduates it (status). Accommodations live
// per-leg in legs[].candidates[] + chosenId (no new columns, per #9). Filter by
// pet policy is wired off traveler chips (markerUnion). Search uses the place
// picker (#13). Compact build; the full shortlist grid is the enhancement.
import { useState } from "react";
import { markerUnion } from "../../lib/trip";
import { MarkerSet } from "./atoms";

export default function StaySection({ trip, onUpdate }) {
  const legs = trip.legs || [];
  const needsDog = markerUnion(trip).includes("dog");
  if (!legs.length) return null;

  return (
    <div className="trip-card" style={{ marginTop: "1rem" }}>
      <h2>
        Stay{" "}
        {needsDog ? <small className="trip-ws-sub">· filtering for 🐾 dog-friendly</small> : null}
      </h2>
      {legs.map((leg, i) => (
        <LegStays
          key={i}
          leg={leg}
          needsDog={needsDog}
          onChange={(patch) =>
            onUpdate({ legs: legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
          }
        />
      ))}
    </div>
  );
}

function LegStays({ leg, needsDog, onChange }) {
  const [name, setName] = useState("");
  const candidates = leg.candidates || [];
  const shown = needsDog
    ? candidates.filter((c) => (c.markers || []).some((m) => m.type === "dog"))
    : candidates;

  function add() {
    if (!name.trim()) return;
    const stay = {
      id: `stay_${Date.now()}`,
      name: name.trim(),
      markers: [],
      status: "shortlisted",
    };
    onChange({ candidates: [...candidates, stay] });
    setName("");
  }
  function choose(id) {
    onChange({ chosenId: id });
  }

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <strong>{leg.name || leg.cityId}</strong>
      <div className="entry-list">
        {shown.map((c) => (
          <div
            key={c.id}
            className="entry-card"
            data-category="stay"
            style={{ "--spine": "var(--kind-stay)" }}
          >
            <div className="entry-card-title">
              {leg.chosenId === c.id ? "✓ " : ""}
              {c.name}
              {c.priceRange ? <small className="trip-ws-sub"> · {c.priceRange}</small> : null}
            </div>
            <MarkerSet markers={c.markers} />
            <div>
              <button type="button" className="auth-ghost" onClick={() => choose(c.id)}>
                {leg.chosenId === c.id ? "Chosen" : "Choose"}
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 ? (
          <p className="trip-ws-sub">No candidates{needsDog ? " match the dog filter" : ""} yet.</p>
        ) : null}
      </div>
      <div className="entry-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a stay candidate…"
        />
        <button type="button" className="auth-ghost" onClick={add}>
          + Add
        </button>
      </div>
    </div>
  );
}
