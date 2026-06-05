"use client";

import Link from "next/link";
import AppShell, { defaultCityNav, modeForCity } from "./AppShell";
import MagazineDetail from "./city-detail/MagazineDetail";
import { usePlannerCity } from "./PlannerProvider";

export default function CityDetailRoute({ slug }) {
  const cityItem = usePlannerCity(slug);

  if (!cityItem) {
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
