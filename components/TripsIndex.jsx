"use client";

// /trips — the trips list (minimal #18). Lists the user's trips from
// TripProvider; each links to its workspace.
import Link from "next/link";
import { useTrips } from "./TripProvider";

export default function TripsIndex() {
  const { trips, hydrated } = useTrips();
  return (
    <main className="tw-wrap">
      <header className="tw-head">
        <h1>Trips</h1>
        <p className="tw-meta">Plan · Shelf · Days · Book · Grid — the real trip planner.</p>
      </header>
      {!hydrated ? <p className="tw-loading">Loading…</p> : trips.length === 0 ? (
        <p className="tw-empty">No trips yet.</p>
      ) : (
        <ul className="tw-list">
          {trips.map((t) => (
            <li key={t.id} className="tw-list-row">
              <Link href={`/trips/${t.id}`}>
                <b>{t.name}</b>
                <span className="tw-meta">{t.startDate} – {t.endDate} · {t.legs?.length || 0} legs</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
