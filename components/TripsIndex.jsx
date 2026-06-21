"use client";

// /trips — the trips list (#18) + the New-trip composer entry (#19).
// Each trip renders as a dossier card: its name, the route (the city path —
// the signature "where does this go" signal), a human date range, nights, and
// who's going. Same paper/Fraunces/green language as the rest of the app, so
// the landing page reads as designed, not as a debug list.
import { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "./AppShell";
import { useTrips } from "./TripProvider";
import { tripDisplayName, tripDietChips } from "../lib/trip";
import { daysBetween } from "../lib/trip-window";
import TripComposer from "./TripComposer";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parseYmd = (s) => {
  const m = (s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
};
// "May 15–25, 2026" / "May 28 – Jun 3, 2026" / "Dec 30, 2025 – Jan 2, 2026".
// Honest blank when dates aren't set — never a fabricated range.
function formatRange(start, end) {
  const a = parseYmd(start), b = parseYmd(end);
  if (!a && !b) return "Dates not set";
  if (a && !b) return `${MON[a.mo - 1]} ${a.d}, ${a.y}`;
  if (!a && b) return `${MON[b.mo - 1]} ${b.d}, ${b.y}`;
  if (a.y === b.y && a.mo === b.mo) return `${MON[a.mo - 1]} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MON[a.mo - 1]} ${a.d} – ${MON[b.mo - 1]} ${b.d}, ${a.y}`;
  return `${MON[a.mo - 1]} ${a.d}, ${a.y} – ${MON[b.mo - 1]} ${b.d}, ${b.y}`;
}

const shortCity = (leg) => (leg?.name || "").split(",")[0].trim();

function TripCard({ trip }) {
  const route = (trip.legs || []).map(shortCity).filter(Boolean);
  const nights = trip.startDate && trip.endDate ? daysBetween(trip.startDate, trip.endDate) : null;
  const people = (trip.travelers || []).map((t) => t.name).filter(Boolean);
  const diet = tripDietChips(trip);
  const meta = [formatRange(trip.startDate, trip.endDate)];
  if (nights != null && nights > 0) meta.push(`${nights} ${nights === 1 ? "night" : "nights"}`);
  if (people.length) meta.push(people.join(", "));

  return (
    <Link href={`/trips/${trip.id}`} className="tw-trip-card">
      <h2 className="tw-trip-card-name">{tripDisplayName(trip)}</h2>
      {route.length ? (
        <p className="tw-route">
          {route.slice(0, 4).map((c, i) => (
            <span key={i} className="tw-route-stop">
              {i > 0 ? <span className="tw-route-arrow" aria-hidden="true">→</span> : null}
              {c}
            </span>
          ))}
          {route.length > 4 ? <span className="tw-route-more">+{route.length - 4} more</span> : null}
        </p>
      ) : (
        <p className="tw-route tw-route-empty">No stops yet — open to start planning</p>
      )}
      <p className="tw-card-meta">
        {meta.join("  ·  ")}
        {diet.length ? <em className="tw-card-diet"> · {diet.join(" / ")}</em> : null}
      </p>
      {(trip.regions || []).length ? (
        <ul className="tw-card-regions">
          {trip.regions.map((r, i) => (
            <li key={`${r.label}-${i}`} className={`tw-region-chip tw-region-chip-static kind-${r.kind}`}>{r.label}</li>
          ))}
        </ul>
      ) : null}
    </Link>
  );
}

export default function TripsIndex() {
  const { trips, hydrated } = useTrips();
  const [composing, setComposing] = useState(false);
  const [regionFilter, setRegionFilter] = useState(null); // region label, or null = all

  // Distinct region tags across all trips (#79) — the cross-trip filter set.
  // Deduped by label (case-insensitive), keeping the first kind seen.
  const allRegions = useMemo(() => {
    const seen = new Map();
    for (const t of trips) for (const r of t.regions || []) {
      const key = r.label?.toLowerCase();
      if (key && !seen.has(key)) seen.set(key, { label: r.label, kind: r.kind });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [trips]);

  const shown = useMemo(() => (
    regionFilter
      ? trips.filter((t) => (t.regions || []).some((r) => r.label.toLowerCase() === regionFilter.toLowerCase()))
      : trips
  ), [trips, regionFilter]);

  const total = trips.length;
  const meta = !hydrated
    ? "Loading…"
    : total === 0
      ? "No trips yet"
      : regionFilter
        ? `${shown.length} of ${total} ${total === 1 ? "trip" : "trips"} · in ${regionFilter}`
        : `${total} ${total === 1 ? "trip" : "trips"}`;
  return (
    // Wrapped in the global AppShell (#65) so /trips has the same top nav as the
    // rest of the app — it was a dead-end (no way back to Board/Planning/…).
    <AppShell activeMode="trips">
      <div className="tw-wrap tw-trips-index">
        <header className="tw-head tw-index-head">
          <div>
            <h1>Trips</h1>
            <p className="tw-meta">{meta}</p>
          </div>
          <button className="ee-done" onClick={() => setComposing(true)}>＋ New trip</button>
        </header>

        {/* Cross-trip region/state filter (#79) — only when tags exist. */}
        {hydrated && allRegions.length > 0 ? (
          <div className="tw-region-filter" role="group" aria-label="Filter trips by region">
            <button type="button" className={`tw-region-filter-chip${regionFilter === null ? " on" : ""}`}
                    onClick={() => setRegionFilter(null)} aria-pressed={regionFilter === null}>All</button>
            {allRegions.map((r) => {
              const on = regionFilter?.toLowerCase() === r.label.toLowerCase();
              return (
                <button key={r.label} type="button"
                        className={`tw-region-filter-chip kind-${r.kind}${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() => setRegionFilter(on ? null : r.label)}>{r.label}</button>
              );
            })}
          </div>
        ) : null}

        {!hydrated ? (
          <p className="tw-loading">Loading…</p>
        ) : total === 0 ? (
          <div className="tw-trip-empty">
            <p>No trips yet.</p>
            <button className="ee-done" onClick={() => setComposing(true)}>＋ Start your first trip</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="tw-trip-empty">
            <p>No trips tagged <strong>{regionFilter}</strong>.</p>
            <button className="ee-done" onClick={() => setRegionFilter(null)}>Show all trips</button>
          </div>
        ) : (
          <div className="tw-trip-grid">
            {shown.map((t) => <TripCard key={t.id} trip={t} />)}
          </div>
        )}
        {composing ? <TripComposer onClose={() => setComposing(false)} /> : null}
      </div>
    </AppShell>
  );
}
