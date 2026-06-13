"use client";

// /trips — the trips list (#18) + the New-trip composer entry (#19).
import { useState } from "react";
import Link from "next/link";
import AppShell from "./AppShell";
import { useTrips } from "./TripProvider";
import { tripDisplayName } from "../lib/trip";
import TripComposer from "./TripComposer";

export default function TripsIndex() {
  const { trips, hydrated } = useTrips();
  const [composing, setComposing] = useState(false);
  return (
    // Wrapped in the global AppShell (#65) so /trips has the same top nav as the
    // rest of the app — it was a dead-end (no way back to Board/Planning/…).
    <AppShell activeMode="trips">
    <div className="tw-wrap">
      <header className="tw-head tw-index-head">
        <div>
          <h1>Trips</h1>
          <p className="tw-meta">Plan · Shelf · Days · Book · Grid — the real trip planner.</p>
        </div>
        <button className="ee-done" onClick={() => setComposing(true)}>＋ New trip</button>
      </header>
      {!hydrated ? <p className="tw-loading">Loading…</p> : trips.length === 0 ? (
        <p className="tw-empty">No trips yet — start one.</p>
      ) : (
        <ul className="tw-list">
          {trips.map((t) => (
            <li key={t.id} className="tw-list-row">
              <Link href={`/trips/${t.id}`}>
                <b>{tripDisplayName(t)}</b>
                <span className="tw-meta">{t.startDate || "—"} – {t.endDate || "—"} · {t.legs?.length || 0} legs</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {composing ? <TripComposer onClose={() => setComposing(false)} /> : null}
    </div>
    </AppShell>
  );
}
