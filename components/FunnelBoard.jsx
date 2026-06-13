"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STAGES,
  STAGE_INDEX,
  cityImageQuery,
  cityStage,
  citySlug,
  revisitLabel,
  learnedAxisWeights,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import FunnelHeader from "./FunnelHeader";
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

  // Use the same weights as the Ranking view so Board and Ranking order
  // consistently. Falls back to equal weights when <6 places are surveyed
  // (learnedAxisWeights returns null weights until the threshold is met, and
  // weightedAxisScore falls back to equal weights in that case anyway).
  const learned = useMemo(() => learnedAxisWeights(planner.cities), [planner.cities]);
  const boardWeights = useMemo(
    () => learned.weights || EQUAL_WEIGHTS,
    [learned.weights],
  );

  const cityRows = useMemo(() => visibleCities.map((cityItem) => ({
    ...augmentCityForFilters(cityItem),
    overall: weightedAxisScore(cityItem, boardWeights),
    visitNow: visitNowScore(cityItem, filters.nowMonth),
  })), [visibleCities, boardWeights, filters.nowMonth]);

  const options = useMemo(() => availableFilterOptions(cityRows), [cityRows]);
  const filteredCities = useMemo(
    () => applyCityFilters(cityRows, filters).map((r) => r.cityItem),
    // Depend on primitive fields rather than the filters object identity so this
    // memo doesn't re-run when useCityFilters returns a new wrapper object with
    // the same values (e.g. on unrelated state changes in the parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cityRows, filters.query, filters.regions, filters.states, filters.chipFilters, filters.chipMode, filters.axisMins, filters.visitNowMin],
  );

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(STAGES.map((stage) => [stage.id, []]));
    for (const cityItem of filteredCities) buckets[cityStage(cityItem)].push(cityItem);
    for (const list of Object.values(buckets)) {
      list.sort((a, b) => (weightedAxisScore(b, boardWeights) ?? -1) - (weightedAxisScore(a, boardWeights) ?? -1));
    }
    return buckets;
  }, [filteredCities, boardWeights]);

  const visibleStages = focusStage ? STAGES.filter((stage) => stage.id === focusStage) : STAGES;
  const totalForFocus = focusStage ? (grouped[focusStage] || []).length : filteredCities.length;

  // Native drag is a desktop-only convenience for the two FREE moves. Planned
  // (commit dates), Visited (return), and Assessed (survey) require data entered
  // on their own pages, so they are NOT drop targets — see canDrop. On touch
  // (where HTML5 DnD doesn't fire at all) every free move is reachable via the
  // card's ← Backlog / Planning → footer buttons, and the gated moves via the
  // city's own page; the "drag to move" hint is hidden on touch (#59).
  const canDrop = (stageId) => stageId === "backlog" || stageId === "planning";
  function onCardDragStart(e, cityItem) {
    e.dataTransfer.setData("text/plain", cityItem.id);
    e.dataTransfer.effectAllowed = "move";
  }
  // Only call preventDefault() (which signals a valid drop + lights the column)
  // for stages a card can actually land in — a data-gated column no longer
  // shows a green drop highlight it would silently reject (#60).
  function onColDragOver(e, stageId) {
    if (!canDrop(stageId)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(stageId);
  }
  function onColDragLeave(stageId) { setDragOver((s) => (s === stageId ? null : s)); }
  function onColDrop(e, stageId) {
    setDragOver(null);
    if (!canDrop(stageId)) return; // defense: gated columns never preventDefault, so won't fire drop
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) setCityStage(id, stageId);
  }

  return (
    <AppShell activeMode="board">
      <FunnelHeader
        meta={
          <>
            {!hydrated
              ? "Loading…"
              : focusStage
              ? `${totalForFocus} ${totalForFocus === 1 ? "city" : "cities"} in ${STAGES.find((stage) => stage.id === focusStage)?.label}`
              : `${filteredCities.length} of ${planner.cities.filter((c) => !hideCalibration || !c.isCalibration).length} candidates`}
            {hydrated ? <span className="funnel-meta-hint"> · <span className="hint-drag">drag or </span>use the buttons to move · open a card for the rest</span> : null}
          </>
        }
      />

      <section className="rank-controls" aria-label="Filter candidates">
        <ViewToggle active="board" />
        <input
          type="search"
          className="rank-search"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
          placeholder="Search city name…"
          aria-label="Search city name"
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
                className={`funnel-column stage-${stage.id}${isOver ? " drag-over" : ""}`}
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
                  <EmptyColumn stage={stage} droppable={canDrop(stage.id)} />
                ) : (
                  <div className="funnel-column-list">
                    {cities.map((cityItem) => (
                      <CityCard
                        key={cityItem.id}
                        cityItem={cityItem}
                        imageState={imageState}
                        weights={boardWeights}
                        onOpen={() => router.push(`/cities/${citySlug(cityItem)}`)}
                        onAdvance={() => advanceCityStage(cityItem.id)}
                        onSendBack={() => setCityStage(cityItem.id, "backlog")}
                        onDragStart={(e) => onCardDragStart(e, cityItem)}
                        onDragEnd={() => setDragOver(null)}
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
function CityCard({ cityItem, imageState, weights, onOpen, onAdvance, onSendBack, onDragStart, onDragEnd, stage }) {
  const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
  const heroSrc = resolveImage(cityItem.heroImage, heroQuery, imageState);
  const cardWeights = weights || EQUAL_WEIGHTS;
  const score = weightedAxisScore(cityItem, cardWeights);
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
      onDragEnd={onDragEnd}
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
          <span className={`decision-chip ${cityItem.decision?.toLowerCase().replace(/\s+/g, "-") || "assessed"}`}>{revisitLabel(cityItem.decision)}</span>
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

function EmptyColumn({ stage, droppable }) {
  return (
    <div className="funnel-column-empty">
      {/* Only promise a drop where one is actually accepted (#60). Gated stages
          fill from a city's own page, not by dropping a card here. */}
      <p>{droppable ? "Drop a card here" : "Set from a city's page"}</p>
    </div>
  );
}
