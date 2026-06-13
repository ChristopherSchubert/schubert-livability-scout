"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  cityImageQuery,
  cityStage,
  citySlug,
  feltScore,
  surveyComplete,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { WorkspaceLoading } from "./Loading";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";

/**
 * DecideWorkspace — cities back from a trip, awaiting (or holding) their
 * felt-score survey. Surveyed cities show their Gut score; unsurveyed
 * ones prompt to run the questionnaire.
 */
export default function DecideWorkspace() {
  const { planner, imageState, hydrated } = usePlanner();

  const queue = useMemo(
    () => planner.cities.filter((c) => cityStage(c) === "visited"),
    [planner.cities],
  );

  return (
    <AppShell activeMode="visited">
      <section className="canvas-header">
        <div>
          <p className="page-eyebrow">Visited</p>
          <h1>Back from the trip</h1>
          <p className="canvas-sub">
            {!hydrated
              ? "Loading…"
              : queue.length === 0
              ? "No cities back from a trip yet. They show up here once you mark a Visit complete."
              : `${queue.length} ${queue.length === 1 ? "city" : "cities"} to survey. Run the questionnaire soon after the trip while the impression is fresh.`}
          </p>
        </div>
      </section>

      {!hydrated ? (
        <WorkspaceLoading />
      ) : queue.length === 0 ? (
        <section className="workspace-empty">
          <h2>Nothing to look back on yet</h2>
          <p>Finish a trip and the city lands here for its post-visit survey.</p>
          <Link className="button-link" href="/planned">Go to Planned</Link>
        </section>
      ) : (
        <ul className="verdict-list">
          {queue.map((cityItem) => {
            const slug = citySlug(cityItem);
            const heroSrc = resolveImage(cityItem.heroImage, cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection), imageState);
            const done = surveyComplete(cityItem.survey);
            const felt = done ? feltScore(cityItem.survey) : null;
            return (
              <li key={cityItem.id} className="verdict-row">
                <div className="verdict-media">
                  {heroSrc ? <img src={appendBust(heroSrc, imageState.version)} alt="" /> : <div className="verdict-media-fallback">{cityItem.name.slice(0, 1)}</div>}
                </div>
                <div className="verdict-body">
                  <header className="verdict-head">
                    <Link className="verdict-name" href={`/cities/${slug}/assess`}>{cityItem.name}</Link>
                    {done
                      ? <span className="felt-chip">Gut {felt.toFixed(0)}/10</span>
                      : <span className="felt-chip pending">Not surveyed</span>}
                  </header>
                  <p className="verdict-sub">{cityItem.stayZone || "—"}</p>
                </div>
                <div className="verdict-actions">
                  <Link className="button-link" href={`/cities/${slug}/assess`}>{done ? "View survey" : "Run survey"}</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
