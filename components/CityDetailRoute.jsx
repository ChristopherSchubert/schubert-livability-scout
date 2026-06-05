"use client";

import Link from "next/link";
import AppShell, { defaultCityNav, modeForCity } from "./AppShell";
import MagazineDetail from "./city-detail/MagazineDetail";
import { usePlanner, usePlannerCity } from "./PlannerProvider";

export default function CityDetailRoute({ slug }) {
  const { hydrated } = usePlanner();
  const cityItem = usePlannerCity(slug);

  if (!cityItem) {
    if (!hydrated) {
      return (
        <AppShell activeMode="board">
          <section className="canvas-header">
            <div>
              <p className="canvas-sub">Loading…</p>
            </div>
          </section>
        </AppShell>
      );
    }
    return (
      <AppShell activeMode="board">
        <section className="canvas-header">
          <div>
            <h1>City not found</h1>
            <p className="canvas-sub">This slug doesn't match anything in your planner.</p>
            <Link className="button-link" href="/calibrate">← Back to Ranking</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell activeMode={modeForCity(cityItem)} cityItem={cityItem} cityNav={defaultCityNav(cityItem, "detail")}>
      <MagazineDetail cityItem={cityItem} />
    </AppShell>
  );
}
