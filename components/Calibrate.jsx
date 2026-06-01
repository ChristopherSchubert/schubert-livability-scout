"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  averageScore,
  benchmarkPlaces,
  cityImageQuery,
  citySlug,
  matrixDimensions,
  normalizeMatrix,
  weightedScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";

/**
 * Calibrate — purpose-built ranking workspace.
 *
 * The ranking is the page. Weights are an occasional adjustment, so they
 * collapse into a compact summary strip above the ranking that shows what
 * you've set and unfolds the sliders inline on demand. Default-collapsed
 * because most visits to this page are "show me the ranking," not "let me
 * re-tune the weights."
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner, imageState, weights, setWeight, resetWeights } = usePlanner();
  const [weightsOpen, setWeightsOpen] = useState(false);

  const ranking = useMemo(() => {
    const candidates = planner.cities.map((cityItem) => {
      const matrix = normalizeMatrix(cityItem.matrix, cityItem.name);
      const weighted = weightedScore(matrix, weights);
      const unweighted = averageScore(matrix);
      // Top three dimensions by absolute score — the city's own character,
      // not its proximity to anything. Lets you read "what is this place
      // good at" without the misleading X-like framing.
      const topDims = matrixDimensions
        .map(([key, label]) => ({ key, label, value: Number(matrix[key] || 0) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
      return { cityItem, matrix, weighted, unweighted, topDims };
    });
    return candidates.sort((a, b) => b.weighted - a.weighted);
  }, [planner.cities, weights]);

  const benchmarkRows = useMemo(() => {
    return benchmarkPlaces.map((bench) => ({
      bench,
      weighted: weightedScore(bench.matrix, weights),
    })).sort((a, b) => b.weighted - a.weighted);
  }, [weights]);

  // A weight set is "default" if every dimension is at 1.0. The strip
  // labels itself differently when the user has actually tuned something.
  const isDefault = matrixDimensions.every(([key]) => Math.abs(Number(weights[key] ?? 1) - 1) < 0.01);

  return (
    <AppShell activeMode="calibrate">
      <section className="canvas-header">
        <div>
          <p className="canvas-eyebrow stage-calibrate-text">Calibrate</p>
          <h1>Rank against the benchmarks</h1>
          <p className="canvas-sub">
            Cities ranked by weighted fit. Each row shows its top three dimensions so you can read the city's character at a glance.
          </p>
        </div>
      </section>

      <WeightsStrip
        weights={weights}
        setWeight={setWeight}
        resetWeights={resetWeights}
        benchmarkRows={benchmarkRows}
        open={weightsOpen}
        onToggle={() => setWeightsOpen((v) => !v)}
        isDefault={isDefault}
      />

      <section className="calibrate-ranking calibrate-ranking-full">
        <header className="calibrate-ranking-head">
          <h2>Ranking</h2>
          <span className="calibrate-count">{ranking.length} candidates</span>
        </header>
        <ol className="ranking-list">
          {ranking.map((row, index) => {
            const slug = citySlug(row.cityItem);
            const heroQuery = cityImageQuery(row.cityItem.name, row.cityItem.stayZone, row.cityItem.heartIntersection);
            const heroSrc = resolveImage(row.cityItem.heroImage, heroQuery, imageState);
            return (
              <li key={row.cityItem.id} className="ranking-row">
                <button type="button" className="ranking-body" onClick={() => router.push(`/cities/${slug}`)}>
                  <span className="ranking-num">{index + 1}</span>
                  <div className="ranking-thumb">
                    {heroSrc
                      ? <img src={appendBust(heroSrc, imageState.version)} alt="" />
                      : <span>{row.cityItem.name.slice(0, 1)}</span>}
                  </div>
                  <div className="ranking-meta">
                    <strong>{row.cityItem.name}</strong>
                    <span>{row.cityItem.stayZone || "—"}</span>
                  </div>
                  <div className="ranking-deltas">
                    {row.topDims.map((dim) => (
                      <span key={dim.key} className="dim-chip">{dim.label} <b>{dim.value}</b></span>
                    ))}
                  </div>
                  <div className="ranking-score">
                    <strong>{row.weighted.toFixed(2)}</strong>
                    <span>avg {row.unweighted.toFixed(1)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </AppShell>
  );
}

function WeightsStrip({ weights, setWeight, resetWeights, benchmarkRows, open, onToggle, isDefault }) {
  return (
    <section className={`weights-strip${open ? " open" : ""}`}>
      <header className="weights-strip-head">
        <button type="button" className="weights-strip-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="weights-strip-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span>Weights</span>
          <span className="weights-strip-status">{isDefault ? "all 1.0× (default)" : "tuned"}</span>
        </button>
        {!open ? (
          <div className="weights-strip-summary">
            {matrixDimensions.map(([key, label]) => {
              const value = Number(weights[key] ?? 1);
              const tuned = Math.abs(value - 1) > 0.01;
              return (
                <span key={key} className={`weights-pill${tuned ? " tuned" : ""}`} title={label}>
                  {shortLabel(label)} <b>{value.toFixed(1)}×</b>
                </span>
              );
            })}
          </div>
        ) : (
          <button type="button" className="ghost" onClick={resetWeights}>Reset</button>
        )}
      </header>

      {open ? (
        <div className="weights-strip-body">
          <div className="weight-list weight-list-grid">
            {matrixDimensions.map(([key, label, help]) => {
              const value = Number(weights[key] ?? 1);
              return (
                <div key={key} className="weight-row">
                  <div className="weight-row-head">
                    <strong title={help}>{label}</strong>
                    <span className="weight-row-value">{value.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.1}
                    value={value}
                    onChange={(event) => setWeight(key, event.target.value)}
                    aria-label={`Weight for ${label}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="benchmark-summary benchmark-summary-inline">
            <span>Benchmarks at these weights:</span>
            {benchmarkRows.map(({ bench, weighted }) => (
              <span key={bench.id} className="benchmark-pill">
                {bench.name.split(",")[0]} <b>{weighted.toFixed(2)}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Compact label used in the collapsed pill row, so 8 dimensions fit in a
// single line without wrapping at typical viewport widths.
function shortLabel(label) {
  const map = {
    "Public realm": "Public",
    "Setting drama": "Setting",
    "Walkable daily life": "Walkable",
    "Cafe culture": "Cafe",
    "Winter public life": "Winter",
    "Realness": "Real",
    "Nature access": "Nature",
    "Value fit": "Value",
  };
  return map[label] || label;
}
