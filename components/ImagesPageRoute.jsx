"use client";

import Link from "next/link";
import { useState } from "react";
import AppShell, { defaultCityNav, modeForCity } from "./AppShell";
import { ImagesPage } from "./PlannerShell";
import { usePlanner, usePlannerCity } from "./PlannerProvider";

export default function ImagesPageRoute({ slug }) {
  const cityItem = usePlannerCity(slug);
  const { imageState, updateCity, applySavedImage } = usePlanner();
  const [searchState, setSearchState] = useState({});

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
    <AppShell activeMode={modeForCity(cityItem)} cityItem={cityItem} cityNav={defaultCityNav(cityItem, "images")}>
      <ImagesPage
        cityItem={cityItem}
        imageState={imageState}
        searchState={searchState}
        setSearchState={setSearchState}
        onPatch={(patch) => updateCity(cityItem.id, patch)}
        onSaved={(query, payload) => applySavedImage(query, payload)}
      />
    </AppShell>
  );
}
