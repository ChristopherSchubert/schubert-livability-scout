"use client";

import Link from "next/link";
import AppShell, { defaultCityNav, modeForCity } from "./AppShell";
import { CityDetail } from "./PlannerShell";
import { usePlanner, usePlannerCity } from "./PlannerProvider";

export default function CityDetailRoute({ slug }) {
  const cityItem = usePlannerCity(slug);
  const { imageState } = usePlanner();

  if (!cityItem) {
    return (
      <AppShell activeMode="board">
        <section className="canvas-header">
          <div>
            <h1>City not found</h1>
            <p className="canvas-sub">This slug doesn't match anything in your planner.</p>
            <Link className="button-link" href="/board">← Back to Board</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell activeMode={modeForCity(cityItem)} cityItem={cityItem} cityNav={defaultCityNav(cityItem, "detail")}>
      <CityDetail cityItem={cityItem} imageState={imageState} />
    </AppShell>
  );
}
