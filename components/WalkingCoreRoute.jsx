"use client";

import Link from "next/link";
import { usePlanner, usePlannerCity } from "./PlannerProvider";
import WalkingCoreView from "./walking-core/WalkingCoreView";

// /cities/[slug]/walking-core — the atlas-style full-screen walking-core view.
//
// Single-city: this page is always scoped to one city by URL slug. Driven by
// usePlannerCity so it picks up the same `cityItem` (with poiPositions and
// measuredMetrics) that the magazine detail uses.
//
// Unlike the other city subpages (decide / visit / images), this view is
// chromeless — no AppShell, no chapter rail. It's a single Leaflet canvas
// with a floating back pill and a side panel. The back link goes to the
// referring page (the `?back=` query param, set by the detail-page link),
// falling back to /cities/[slug] when the page is hit directly.
export default function WalkingCoreRoute({ slug }) {
  const { hydrated } = usePlanner();
  const cityItem = usePlannerCity(slug);

  if (!cityItem) {
    if (!hydrated) {
      return (
        <main style={{ padding: "2rem", fontFamily: "Inter Tight, sans-serif" }}>
          <p>Loading…</p>
        </main>
      );
    }
    return (
      <main style={{ padding: "2rem", fontFamily: "Inter Tight, sans-serif" }}>
        <h1>City not found</h1>
        <p>This slug doesn't match anything in your planner.</p>
        <Link href="/ranking">← Back to Ranking</Link>
      </main>
    );
  }

  return <WalkingCoreView cityItem={cityItem} slug={slug} />;
}
