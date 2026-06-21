"use client";

import { useEffect, useRef, useState } from "react";
import { isGeographicPlace, regionKind } from "../lib/places";

// Trip-level geographic tags (#79): region/state chips that describe the trip
// and power the cross-trip filter + the Plan-tab suggestion anchor. Adding a
// chip geocodes free text via /api/places/search and keeps only geographic
// results; a result with no center yields no chip (never-invent). Chips derived
// from a city leg's state carry `source: "leg"` and read "· from leg".
export default function TripRegions({ regions = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Debounced geocode — keep only geographic results (never a business).
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/places/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit: 6 }),
        });
        const j = await r.json();
        if (!cancelled) setResults((j.results || []).filter(isGeographicPlace));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  function addChip(p) {
    if (p.lat == null || p.lon == null) return; // never-invent: no center, no chip
    const label = (p.name || "").trim();
    if (!label || regions.some((r) => r.label.toLowerCase() === label.toLowerCase())) return;
    onChange([...regions, { label, kind: regionKind(p.types), lat: p.lat, lon: p.lon }]);
    setQ(""); setResults([]); setOpen(false);
  }
  function removeChip(i) { onChange(regions.filter((_, idx) => idx !== i)); }

  return (
    <div className="tw-regions">
      <ul className="tw-region-chips">
        {regions.map((r, i) => (
          <li key={`${r.label}-${i}`} className={`tw-region-chip kind-${r.kind}${r.source === "leg" ? " from-leg" : ""}`}>
            <span className="tw-region-label">{r.label}</span>
            {r.source === "leg" ? <small className="tw-region-src">· from leg</small> : null}
            <button type="button" className="tw-region-x" onClick={() => removeChip(i)} aria-label={`Remove ${r.label}`}>×</button>
          </li>
        ))}
        <li>
          <button type="button" className="tw-region-add" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            + region
          </button>
        </li>
      </ul>

      {open ? (
        <div className="tw-region-pop">
          <input
            ref={inputRef}
            autoFocus
            className="tw-region-input"
            placeholder="Region or state — e.g. Hudson River Valley"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQ(""); } }}
          />
          {busy ? <p className="tw-region-hint">Searching…</p> : null}
          {!busy && q.trim().length >= 2 && results.length === 0 ? (
            <p className="tw-region-hint">No geographic match — try a region, state, or natural feature.</p>
          ) : null}
          {results.length > 0 ? (
            <ul className="tw-region-results">
              {results.map((p) => (
                <li key={p.placeId || p.name}>
                  <button type="button" onClick={() => addChip(p)}>
                    <span className="tw-region-result-name">{p.name}</span>
                    {p.address ? <small>{p.address}</small> : null}
                    <span className={`tw-region-kind kind-${regionKind(p.types)}`}>{regionKind(p.types)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
