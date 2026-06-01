"use client";

import Link from "next/link";
import AppShell, { defaultCityNav, modeForCity } from "./AppShell";
import { CityDetail } from "./PlannerShell";
import { usePlanner, usePlannerCity } from "./PlannerProvider";

export default function CityDetailRoute({ slug }) {
  const cityItem = usePlannerCity(slug);
  const { imageState, updateCity } = usePlanner();

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
      <section className="canvas-header">
        <div>
          <p className="canvas-eyebrow">City detail</p>
          <input
            className="city-title-input city-title-large"
            value={cityItem.name}
            onChange={(event) => updateCity(cityItem.id, { name: event.target.value })}
            aria-label="City name"
          />
        </div>
      </section>
      <CityDetail cityItem={cityItem} imageState={imageState} />
    </AppShell>
  );
}
