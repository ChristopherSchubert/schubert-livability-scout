"use client";

import Link from "next/link";
import AppShell, { defaultCityNav } from "./AppShell";
import { VisitPlan } from "./PlannerShell";
import { usePlanner, usePlannerCity } from "./PlannerProvider";

export default function VisitPlanRoute({ slug }) {
  const cityItem = usePlannerCity(slug);
  const { updateCity } = usePlanner();

  if (!cityItem) {
    return (
      <AppShell activeMode="visit">
        <section className="canvas-header">
          <div>
            <h1>City not found</h1>
            <p className="canvas-sub">This slug doesn't match anything in your planner.</p>
            <Link className="button-link" href="/visit">← Back to Visit queue</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell activeMode="visit" cityItem={cityItem} cityNav={defaultCityNav(cityItem, "visit")}>
      <section className="canvas-header">
        <div>
          <p className="canvas-eyebrow stage-visit-text">Visit plan</p>
          <h1>{cityItem.name}</h1>
          <p className="canvas-sub">Schedule the trip, then fill in real-world details as the visit comes together.</p>
        </div>
      </section>
      <VisitPlan
        cityItem={cityItem}
        onPatch={(patch) => updateCity(cityItem.id, patch)}
        onChangeDay={(nextDays) => updateCity(cityItem.id, { days: nextDays })}
        onChangeChecklist={(nextChecklists) => updateCity(cityItem.id, { checklists: nextChecklists })}
      />
    </AppShell>
  );
}
