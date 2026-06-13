"use client";

import Link from "next/link";
import AppShell, { defaultCityNav } from "./AppShell";
import { VisitPlan } from "./PlannerShell";
import { usePlanner, usePlannerCity } from "./PlannerProvider";

export default function VisitPlanRoute({ slug }) {
  const cityItem = usePlannerCity(slug);
  const { updateCity, hydrated } = usePlanner();

  if (!cityItem) {
    if (!hydrated) {
      return (
        <AppShell activeMode="plan">
          <section className="canvas-header"><div><p className="canvas-sub">Loading…</p></div></section>
        </AppShell>
      );
    }
    return (
      <AppShell activeMode="plan">
        <section className="canvas-header">
          <div>
            <h1>City not found</h1>
            <p className="canvas-sub">This slug doesn't match anything in your planner.</p>
            <Link className="button-link" href="/planning">← Back to Planning</Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell activeMode="plan" cityItem={cityItem} cityNav={defaultCityNav(cityItem, "plan")}>
      <VisitPlan
        cityItem={cityItem}
        onPatch={(patch) => updateCity(cityItem.id, patch)}
        onChangeDay={(nextDays) => updateCity(cityItem.id, { days: nextDays })}
        onChangeChecklist={(nextChecklists) => updateCity(cityItem.id, { checklists: nextChecklists })}
      />
    </AppShell>
  );
}
