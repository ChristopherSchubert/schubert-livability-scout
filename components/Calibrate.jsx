"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  axisRollup,
  calibrateAxes,
  cityImageQuery,
  citySlug,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";

/**
 * Calibrate — purpose-built ranking workspace.
 *
 * Ranks candidates by their MEASURED fit: the five axis rollups (Setting,
 * Aliveness, Fabric, Realness, January), each an absolute 0–10 score from the
 * cited metrics, combined with per-axis weights you can tune. No hand-scored
 * matrix — the ranking is built from the same measured numbers as the detail
 * page. Weights collapse into a compact strip; the ranking is the page.
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner, imageState, weights, setWeight, resetWeights } = usePlanner();
  const [weightsOpen, setWeightsOpen] = useState(false);

  const ranking = useMemo(() => {
    const candidates = planner.cities.map((cityItem) => {
      const roll = axisRollup(cityItem);
      const present = calibrateAxes
        .map(([key, label]) => ({ key, label, value: roll[key] }))
        .filter((a) => a.value != null);
      const weighted = weightedAxisScore(cityItem, weights);
      const unweighted = present.length ? present.reduce((s, a) => s + a.value, 0) / present.length : null;
      // Top three axes by score — the city's measured strengths.
      const topAxes = [...present].sort((a, b) => b.value - a.value).slice(0, 3);
      return { cityItem, weighted, unweighted, topAxes, measured: present.length > 0 };
    });
    // Measured cities first, ranked high→low; unmeasured fall to the bottom.
    return candidates.sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1));
  }, [planner.cities, weights]);

  const isDefault = calibrateAxes.every(([key]) => Math.abs(Number(weights[key] ?? 1) - 1) < 0.01);

  return (
    <AppShell activeMode="calibrate">
      <section className="canvas-header">
        <div>
          <p className="canvas-eyebrow stage-calibrate-text">Calibrate</p>
          <h1>Rank by measured fit</h1>
          <p className="canvas-sub">
            Candidates ranked by their measured 0–10 scores across the five axes, weighted by how much each matters to you. Built from the cited metrics — never hand-scored.
          </p>
        </div>
      </section>

      <WeightsStrip
        weights={weights}
        setWeight={setWeight}
        resetWeights={resetWeights}
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
                    {row.measured
                      ? row.topAxes.map((axis) => (
                          <span key={axis.key} className="dim-chip">{shortLabel(axis.label)} <b>{axis.value.toFixed(1)}</b></span>
                        ))
                      : <span className="dim-chip dim-chip-empty">not yet measured</span>}
                  </div>
                  <div className="ranking-score">
                    <strong>{row.weighted != null ? row.weighted.toFixed(2) : "—"}</strong>
                    <span>{row.unweighted != null ? `avg ${row.unweighted.toFixed(1)}` : "no data"}</span>
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

function WeightsStrip({ weights, setWeight, resetWeights, open, onToggle, isDefault }) {
  return (
    <section className={`weights-strip${open ? " open" : ""}`}>
      <header className="weights-strip-head">
        <button type="button" className="weights-strip-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="weights-strip-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span>Axis weights</span>
          <span className="weights-strip-status">{isDefault ? "all 1.0× (default)" : "tuned"}</span>
        </button>
        {!open ? (
          <div className="weights-strip-summary">
            {calibrateAxes.map(([key, label]) => {
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
            {calibrateAxes.map(([key, label]) => {
              const value = Number(weights[key] ?? 1);
              return (
                <div key={key} className="weight-row">
                  <div className="weight-row-head">
                    <strong>{label}</strong>
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
        </div>
      ) : null}
    </section>
  );
}

function shortLabel(label) {
  return { "January test": "January" }[label] || label;
}
