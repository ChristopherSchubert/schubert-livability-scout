"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STAGES,
  cityStage,
  citySlug,
  learnedAxisWeights,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { CityCard } from "./FunnelCard";
import FunnelHeader from "./FunnelHeader";
import { WorkspaceLoading } from "./Loading";
import { usePlanner } from "./PlannerProvider";
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
 * setCityStage). Reference places are hidden by default (toggle in the Filters
 * pane). Cards are compact so 60+ places don't crowd; order inside each
 * column is by the measured fit score, same engine as Compare.
 *
 * Filters reuse the shared drawer/chips/sliders from components/city-filters
 * so Board and Compare offer the same vocabulary (region/state/chips/axis
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
              ? `${totalForFocus} ${totalForFocus === 1 ? "place" : "places"} in ${STAGES.find((stage) => stage.id === focusStage)?.label}`
              : `${filteredCities.length} of ${planner.cities.filter((c) => !hideCalibration || !c.isCalibration).length} places`}
            {hydrated ? <span className="funnel-meta-hint"> · <span className="hint-drag">drag or </span>use the buttons to move · open a card for the rest</span> : null}
          </>
        }
      />

      <section className="rank-controls" aria-label="Filter places">
        <ViewToggle active="board" />
        <input
          type="search"
          className="rank-search"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
          placeholder="Search a place…"
          aria-label="Search place name"
        />
        <CityFiltersBar filters={filters} />
      </section>

      {!hydrated ? <WorkspaceLoading label="Loading places…" /> : (
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
                        usingLearnedWeights={Boolean(learned.weights)}
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

      <CityFilterDrawer
        filters={filters}
        options={options}
        hideCalibration={hideCalibration}
        setHideCalibration={setHideCalibration}
        calCount={calCount}
      />
    </AppShell>
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
