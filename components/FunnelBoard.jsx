"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STAGES,
  STAGE_INDEX,
  cityImageQuery,
  cityStage,
  citySlug,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { WorkspaceLoading } from "./Loading";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";
import ViewToggle from "./ViewToggle";
import {
  CityFilterDrawer,
  CityFiltersBar,
  applyCityFilters,
  augmentCityForFilters,
  availableFilterOptions,
  useCityFilters,
} from "./city-filters";

/**
 * FunnelBoard — kanban over the funnel stages.
 *
 * Each stage is a drop column; cards are draggable between them (drops call
 * setCityStage). Calibration/reference places are hidden by default (toggle to
 * show). Cards are compact so 60+ candidates don't crowd; ranking inside each
 * column is by the measured Overall score, same engine as Calibrate.
 *
 * Filters reuse the shared drawer/chips/sliders from components/city-filters
 * so Board and Ranking offer the same vocabulary (region/state/chips/axis
 * minimums) without duplicated state or UI.
 */
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

export default function FunnelBoard({ focusStage }) {
  const router = useRouter();
  const { planner, imageState, advanceCityStage, setCityStage, hydrated } = usePlanner();
  const filters = useCityFilters();
  const [hideCalibration, setHideCalibration] = useState(true);
  const [dragOver, setDragOver] = useState(null);

  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const cityRows = useMemo(() => visibleCities.map((cityItem) => ({
    ...augmentCityForFilters(cityItem),
    overall: weightedAxisScore(cityItem, EQUAL_WEIGHTS),
    visitNow: visitNowScore(cityItem, filters.nowMonth),
  })), [visibleCities, filters.nowMonth]);

  const options = useMemo(() => availableFilterOptions(cityRows), [cityRows]);
  const filteredCities = useMemo(
    () => applyCityFilters(cityRows, filters).map((r) => r.cityItem),
    [cityRows, filters],
  );

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(STAGES.map((stage) => [stage.id, []]));
    for (const cityItem of filteredCities) buckets[cityStage(cityItem)].push(cityItem);
    for (const list of Object.values(buckets)) {
      list.sort((a, b) => (weightedAxisScore(b, EQUAL_WEIGHTS) ?? -1) - (weightedAxisScore(a, EQUAL_WEIGHTS) ?? -1));
    }
    return buckets;
  }, [filteredCities]);

  const visibleStages = focusStage ? STAGES.filter((stage) => stage.id === focusStage) : STAGES;
  const totalForFocus = focusStage ? (grouped[focusStage] || []).length : filteredCities.length;

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
    if (!id) return;
    // Only Backlog and Planning are free moves. Planned (commit dates), Visited
    // (return), and Assessed (survey) require data entered on their own pages —
    // block the drop rather than fake the transition.
    if (stageId !== "backlog" && stageId !== "planning") return;
    setCityStage(id, stageId);
  }

  return (
    <AppShell activeMode="board">
      <section className="funnel-header">
        <div className="funnel-header-titles">
          <p className="page-eyebrow">Board</p>
          <h1>Every candidate, by stage</h1>
          <p className="funnel-meta">
            {!hydrated
              ? "Loading…"
              : focusStage
              ? `${totalForFocus} ${totalForFocus === 1 ? "city" : "cities"} in ${STAGES.find((stage) => stage.id === focusStage)?.label}`
              : `${filteredCities.length} of ${planner.cities.filter((c) => !hideCalibration || !c.isCalibration).length} candidates`}
            {hydrated ? <span className="funnel-meta-hint"> · drag to move · click to open</span> : null}
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled
          title="Adding candidates is paused"
        >
          + Add candidate
        </button>
      </section>

      <section className="rank-controls" aria-label="Filter candidates">
        <ViewToggle active="board" />
        <input
          type="search"
          className="rank-search"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
          placeholder="Search city name…"
        />
        <CityFiltersBar filters={filters} />
        <span className="rank-controls-spacer" />
        {calCount > 0 ? (
          <label className="rank-toggle">
            <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
            Hide calibration ({calCount})
          </label>
        ) : null}
      </section>

      {!hydrated ? <WorkspaceLoading label="Loading candidates…" /> : (
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
                        onSendBack={() => setCityStage(cityItem.id, "backlog")}
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

      <CityFilterDrawer filters={filters} options={options} />
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
  const isAssessed = stageId === "assessed";
  // Only Backlog → Planning is a free one-click advance. Planning→Planned,
  // Planned→Visited, Visited→Assessed each need data entered on their own page,
  // so the Board offers no advance button for them.
  const canAdvanceFreely = stageId === "backlog";
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
        {isAssessed ? (
          <span className={`decision-chip ${cityItem.decision?.toLowerCase().replace(/\s+/g, "-") || "assessed"}`}>{cityItem.decision || "Assessed"}</span>
        ) : (
          <>
            {stageId !== "backlog" ? (
              <button type="button" className="ghost" onClick={onSendBack} title="Send back to Backlog">← Backlog</button>
            ) : <span aria-hidden="true" />}
            {canAdvanceFreely
              ? <button type="button" className="advance" onClick={onAdvance} title={`Move to ${nextStage?.label || "next stage"}`}>{advanceLabel}</button>
              : <span aria-hidden="true" />}
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
