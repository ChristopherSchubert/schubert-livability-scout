"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STAGES,
  averageScore,
  cityImageQuery,
  cityStage,
  citySlug,
  normalizeMatrix,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";

/**
 * FunnelBoard — the new home screen.
 *
 * The current Selection Board treats every city as equal. But the user's real
 * question is "where is each candidate in my thinking?" — so the board's
 * columns are the funnel stages themselves. A city's stage is derived from
 * the existing status/decision fields; advance/eliminate buttons rewrite
 * those fields through the provider, so we get the new IA without a schema
 * migration.
 */
export default function FunnelBoard({ focusStage }) {
  const router = useRouter();
  const { planner, imageState, addCity, advanceCityStage, setCityStage, updateCity } = usePlanner();
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(STAGES.map((stage) => [stage.id, []]));
    planner.cities.forEach((cityItem) => {
      buckets[cityStage(cityItem)].push(cityItem);
    });
    Object.values(buckets).forEach((bucket) => {
      bucket.sort((a, b) => averageScore(normalizeMatrix(b.matrix, b.name)) - averageScore(normalizeMatrix(a.matrix, a.name)));
    });
    return buckets;
  }, [planner.cities]);

  const visibleStages = focusStage ? STAGES.filter((stage) => stage.id === focusStage) : STAGES;
  const totalForFocus = focusStage ? (grouped[focusStage] || []).length : planner.cities.length;

  const matches = useMemo(() => {
    if (!query.trim()) return null;
    const needle = query.trim().toLowerCase();
    return planner.cities.filter((cityItem) => cityItem.name.toLowerCase().includes(needle));
  }, [query, planner.cities]);

  return (
    <AppShell activeMode="board">
      <section className="funnel-header">
        <div>
          <p className="canvas-eyebrow">{focusStage ? STAGES.find((stage) => stage.id === focusStage)?.help : "Decision journal"}</p>
          <h1>{focusStage ? STAGES.find((stage) => stage.id === focusStage)?.label : "Where each candidate stands"}</h1>
          <p className="canvas-sub">
            {focusStage
              ? `${totalForFocus} ${totalForFocus === 1 ? "city" : "cities"} in this stage. Advance to move it forward in the funnel, or open it to keep working.`
              : `${planner.cities.length} candidates across ${STAGES.length} stages. Scan the columns to see where your thinking really is.`}
          </p>
        </div>
        <div className="funnel-tools">
          <input
            className="funnel-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a city…"
            aria-label="Search cities"
          />
          <button
            type="button"
            className="primary"
            onClick={() => {
              const next = addCity();
              router.push(`/cities/${citySlug(next)}`);
            }}
          >
            + Add candidate
          </button>
        </div>
      </section>

      {matches ? (
        <section className="search-results">
          {matches.length === 0 ? (
            <p>No cities match “{query}”.</p>
          ) : (
            <div className="search-grid">
              {matches.map((cityItem) => (
                <CityCard
                  key={cityItem.id}
                  cityItem={cityItem}
                  imageState={imageState}
                  onOpen={() => router.push(`/cities/${citySlug(cityItem)}`)}
                  onAdvance={() => advanceCityStage(cityItem.id)}
                  onSendBack={() => setCityStage(cityItem.id, "shortlist")}
                  onCycleHero={(src) => updateCity(cityItem.id, { heroImage: src })}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="funnel-grid">
          {visibleStages.map((stage) => {
            const cities = grouped[stage.id] || [];
            const isEmpty = cities.length === 0;
            return (
              <article key={stage.id} className={`funnel-column stage-${stage.id}${isEmpty ? " funnel-column-empty-slim" : ""}`}>
                <header className="funnel-column-head">
                  <div>
                    <h2>{stage.label}</h2>
                    <p>{stage.help}</p>
                  </div>
                  <span className="funnel-column-count">{cities.length}</span>
                </header>
                {cities.length === 0 ? (
                  <EmptyColumn stage={stage} />
                ) : (
                  <div className="funnel-column-list">
                    {cities.map((cityItem) => (
                      <CityCard
                        key={cityItem.id}
                        cityItem={cityItem}
                        imageState={imageState}
                        onOpen={() => router.push(`/cities/${citySlug(cityItem)}`)}
                        onAdvance={() => advanceCityStage(cityItem.id)}
                        onSendBack={() => setCityStage(cityItem.id, "shortlist")}
                        onCycleHero={(src) => updateCity(cityItem.id, { heroImage: src })}
                        stage={stage.id}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </AppShell>
  );
}

function CityCard({ cityItem, imageState, onOpen, onAdvance, onSendBack, stage }) {
  const scores = normalizeMatrix(cityItem.matrix, cityItem.name);
  const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
  const heroSrc = resolveImage(cityItem.heroImage, heroQuery, imageState);
  const avg = averageScore(scores).toFixed(1);
  const stageId = stage || cityStage(cityItem);
  const isDecided = stageId === "decided";

  return (
    <article className={`funnel-card stage-${stageId}`}>
      <button type="button" className="funnel-card-body" onClick={onOpen}>
        <div className="funnel-card-media">
          {heroSrc ? <img className="funnel-card-image" src={appendBust(heroSrc, imageState.version)} alt="" /> : <div className="funnel-card-placeholder" aria-hidden="true">{cityItem.name.slice(0, 1)}</div>}
          <span className="funnel-card-score" title="Unweighted average">{avg}</span>
        </div>
        <div className="funnel-card-copy">
          <strong>{cityItem.name}</strong>
          <span className="funnel-card-meta">{cityItem.stayZone || "No stay zone"}</span>
        </div>
      </button>
      <footer className="funnel-card-foot">
        {isDecided ? (
          <span className={`decision-chip ${cityItem.decision?.toLowerCase().replace(/\s+/g, "-") || "decided"}`}>{cityItem.decision || "Decided"}</span>
        ) : (
          <>
            <button type="button" className="ghost" onClick={onSendBack} title="Send back to Shortlist">↺</button>
            <button type="button" className="advance" onClick={onAdvance} title="Advance to next stage">Advance →</button>
          </>
        )}
      </footer>
    </article>
  );
}

function EmptyColumn({ stage }) {
  return (
    <div className="funnel-column-empty">
      <p>Nothing in {stage.label.toLowerCase()} yet.</p>
      <small>{stage.help}</small>
    </div>
  );
}

function truncate(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
