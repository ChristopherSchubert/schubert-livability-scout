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
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

// City names are formatted "City, ST" (US) or "City, Country" — the last
// comma-separated segment is the region token we filter on.
function cityRegion(cityItem) {
  const parts = (cityItem.name || "").split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

export default function FunnelBoard({ focusStage }) {
  const router = useRouter();
  const { planner, imageState, addCity, advanceCityStage, setCityStage, updateCity } = usePlanner();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [minScore, setMinScore] = useState("");
  const [hideCalibration, setHideCalibration] = useState(true);
  const [dragOver, setDragOver] = useState(null);

  const calCount = planner.cities.filter((c) => c.isCalibration).length;

  const regionOptions = useMemo(() => {
    const set = new Set();
    for (const c of planner.cities) {
      if (hideCalibration && c.isCalibration) continue;
      const r = cityRegion(c);
      if (r) set.add(r);
    }
    return Array.from(set).sort();
  }, [planner.cities, hideCalibration]);

  const filteredCities = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const min = minScore === "" ? null : Number(minScore);
    return planner.cities.filter((c) => {
      if (hideCalibration && c.isCalibration) return false;
      if (needle && !c.name.toLowerCase().includes(needle)) return false;
      if (region && cityRegion(c) !== region) return false;
      if (min != null && !Number.isNaN(min)) {
        const score = weightedAxisScore(c, EQUAL_WEIGHTS);
        if (score == null || score < min) return false;
      }
      return true;
    });
  }, [planner.cities, hideCalibration, query, region, minScore]);

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
  const hasFilters = Boolean(query || region || minScore);
  function clearFilters() { setQuery(""); setRegion(""); setMinScore(""); }

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
        <div className="funnel-header-titles">
          <p className="page-eyebrow">The board</p>
          <h1>Every candidate, by stage</h1>
          <p className="funnel-meta">
            {focusStage
              ? `${totalForFocus} ${totalForFocus === 1 ? "city" : "cities"} in ${STAGES.find((stage) => stage.id === focusStage)?.label}`
              : `${filteredCities.length} of ${planner.cities.filter((c) => !hideCalibration || !c.isCalibration).length} candidates`}
            <span className="funnel-meta-hint"> · drag to move · click to open</span>
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

      <section className="funnel-filters" aria-label="Filter candidates">
        <input
          className="funnel-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name…"
          aria-label="Filter by name"
        />
        <label className="funnel-filter">
          <span>Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All</option>
            {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="funnel-filter">
          <span>Min score</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="—"
          />
        </label>
        {calCount > 0 ? (
          <label className="cal-toggle">
            <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
            Hide calibration ({calCount})
          </label>
        ) : null}
        {hasFilters ? (
          <button type="button" className="funnel-filter-clear" onClick={clearFilters}>Clear</button>
        ) : null}
      </section>

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
