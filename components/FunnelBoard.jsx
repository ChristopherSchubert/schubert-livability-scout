"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STAGES,
  STAGE_INDEX,
  cityImageQuery,
  cityStage,
  citySlug,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";

/**
 * FunnelBoard — kanban over the funnel stages.
 *
 * Each stage is a drop column; cards are draggable between them (drops call
 * setCityStage). Calibration/reference places are hidden by default (toggle to
 * show). Cards are compact so 60+ candidates don't crowd; ranking inside each
 * column is by the measured Overall score, same engine as Calibrate.
 */
export default function FunnelBoard({ focusStage }) {
  const router = useRouter();
  const { planner, imageState, addCity, advanceCityStage, setCityStage, updateCity } = usePlanner();
  const [query, setQuery] = useState("");
  const [hideCalibration, setHideCalibration] = useState(true);
  const [dragOver, setDragOver] = useState(null);

  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(STAGES.map((stage) => [stage.id, []]));
    for (const cityItem of visibleCities) buckets[cityStage(cityItem)].push(cityItem);
    // Sort each column by Overall (measured), highest first; unscored to the bottom.
    const equal = Object.fromEntries(["setting","aliveness","fabric","realness","january"].map((k) => [k, 1]));
    for (const list of Object.values(buckets)) {
      list.sort((a, b) => (weightedAxisScore(b, equal) ?? -1) - (weightedAxisScore(a, equal) ?? -1));
    }
    return buckets;
  }, [visibleCities]);

  const visibleStages = focusStage ? STAGES.filter((stage) => stage.id === focusStage) : STAGES;
  const totalForFocus = focusStage ? (grouped[focusStage] || []).length : visibleCities.length;

  const matches = useMemo(() => {
    if (!query.trim()) return null;
    const needle = query.trim().toLowerCase();
    return visibleCities.filter((cityItem) => cityItem.name.toLowerCase().includes(needle));
  }, [query, visibleCities]);

  // Drag handlers — set/clear the dataTransfer, highlight column under cursor,
  // and on drop, move the card by writing the column's stage onto the city.
  function onCardDragStart(e, cityItem) {
    e.dataTransfer.setData("text/plain", cityItem.id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onColDragOver(e, stageId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(stageId); }
  function onColDragLeave(stageId) { setDragOver((s) => (s === stageId ? null : s)); }
  function onColDrop(e, stageId) {
    e.preventDefault(); setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) setCityStage(id, stageId);
  }

  return (
    <AppShell activeMode="board">
      <section className="funnel-header">
        <p className="funnel-meta">
          {focusStage
            ? `${totalForFocus} ${totalForFocus === 1 ? "city" : "cities"} in ${STAGES.find((stage) => stage.id === focusStage)?.label}`
            : `${visibleCities.length} candidates`}
          <span className="funnel-meta-hint"> · drag to move · click to open</span>
        </p>
        <div className="funnel-tools">
          {calCount > 0 ? (
            <label className="cal-toggle">
              <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
              Hide calibration ({calCount})
            </label>
          ) : null}
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
                  onDragStart={(e) => onCardDragStart(e, cityItem)}
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
            const isOver = dragOver === stage.id;
            return (
              <article
                key={stage.id}
                className={`funnel-column stage-${stage.id}${isEmpty ? " funnel-column-empty-slim" : ""}${isOver ? " drag-over" : ""}`}
                onDragOver={(e) => onColDragOver(e, stage.id)}
                onDragLeave={() => onColDragLeave(stage.id)}
                onDrop={(e) => onColDrop(e, stage.id)}
              >
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
                        onDragStart={(e) => onCardDragStart(e, cityItem)}
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

// Compact draggable kanban card.
function CityCard({ cityItem, imageState, onOpen, onAdvance, onSendBack, onDragStart, stage }) {
  const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
  const heroSrc = resolveImage(cityItem.heroImage, heroQuery, imageState);
  const equal = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };
  const score = weightedAxisScore(cityItem, equal);
  const stageId = stage || cityStage(cityItem);
  const isDecided = stageId === "decided";
  const nextStage = STAGES[STAGE_INDEX[stageId] + 1];
  const advanceLabel = nextStage ? `${nextStage.label} →` : null;

  return (
    <article
      className={`funnel-card stage-${stageId}`}
      draggable
      onDragStart={onDragStart}
    >
      <button type="button" className="funnel-card-body" onClick={onOpen}>
        <div className="funnel-card-hero">
          {heroSrc
            ? <img className="funnel-card-image" src={appendBust(heroSrc, imageState.version)} alt="" />
            : <div className="funnel-card-placeholder" aria-hidden="true">{cityItem.name.slice(0, 1)}</div>}
          <span className="funnel-card-score" title="Overall measured score (equal weights)">{score != null ? score.toFixed(1) : "—"}</span>
        </div>
        <div className="funnel-card-copy">
          <strong>{cityItem.name}</strong>
          <span className="funnel-card-meta">{cityItem.stayZone || "—"}</span>
        </div>
      </button>
      <footer className="funnel-card-foot">
        {isDecided ? (
          <span className={`decision-chip ${cityItem.decision?.toLowerCase().replace(/\s+/g, "-") || "decided"}`}>{cityItem.decision || "Decided"}</span>
        ) : (
          <>
            {stageId !== "shortlist" ? (
              <button type="button" className="ghost" onClick={onSendBack} title="Send back to Shortlist">← Shortlist</button>
            ) : <span aria-hidden="true" />}
            <button type="button" className="advance" onClick={onAdvance} title={`Move to ${nextStage?.label || "next stage"}`}>{advanceLabel}</button>
          </>
        )}
      </footer>
    </article>
  );
}

function EmptyColumn({ stage }) {
  return (
    <div className="funnel-column-empty">
      <p>Drop a card here or use Advance →</p>
      <small>{stage.help}</small>
    </div>
  );
}
