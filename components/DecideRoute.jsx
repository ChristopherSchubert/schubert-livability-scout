"use client";

import Link from "next/link";
import Decide from "./Decide";
import AppShell from "./AppShell";
import { usePlannerCity } from "./PlannerProvider";

export default function DecideRoute({ slug }) {
  const cityItem = usePlannerCity(slug);
  if (!cityItem) {
    return (
      <AppShell activeStage="decide">
        <section className="canvas-header">
          <div>
            <h1>City not found</h1>
            <p className="canvas-sub">This slug doesn't match anything in your planner. Jump back to the funnel and pick a candidate.</p>
            <Link className="button-link" href="/shortlist">← Back to Shortlist</Link>
          </div>
        </section>
      </AppShell>
    );
  }
  return <Decide cityItem={cityItem} />;
}
