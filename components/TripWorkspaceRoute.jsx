"use client";

// TripWorkspaceRoute (#15) — the "use client" route shell for /trips/[id]/[tab].
// Mirrors CityDetailRoute: read the trip from context, handle loading/not-found,
// and render the workspace inside <AppShell activeMode="trips"> with the trip
// context strip + sub-tabs. The active panel is selected by `activeTab` (URL),
// not in-page state — switching views is navigation (project convention).
import { useEffect } from "react";
import Link from "next/link";
import AppShell, { defaultTripNav } from "./AppShell";
import { useTrips } from "./TripProvider";
import TripWorkspace from "./TripWorkspace";

export default function TripWorkspaceRoute({ id, activeTab }) {
  const { active, hydrated, enterTrip } = useTrips();
  useEffect(() => { if (id) enterTrip(id); }, [id]); // eslint-disable-line
  const trip = active && active.id === id ? active : null;

  if (!trip) {
    return (
      <AppShell activeMode="trips">
        <section className="canvas-header">
          <div>
            <h1>{hydrated ? "Trip not found" : "Loading trip…"}</h1>
            {hydrated ? (
              <>
                <p className="canvas-sub">This trip isn’t in your planner.</p>
                <Link className="button-link" href="/trips">← All trips</Link>
              </>
            ) : null}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell activeMode="trips" tripItem={trip} tripNav={defaultTripNav(trip, activeTab)}>
      <TripWorkspace tripId={id} activeTab={activeTab} />
    </AppShell>
  );
}
