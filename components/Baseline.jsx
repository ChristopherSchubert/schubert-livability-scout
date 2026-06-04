"use client";

import { useState } from "react";
import { baselineReferences, surveyAxes, feltScore, surveyComplete, emptySurvey } from "../lib/planner-data";
import AppShell from "./AppShell";
import SurveyFlow from "./SurveyFlow";
import { usePlanner } from "./PlannerProvider";

/**
 * Baseline — track #3. Rate places you already know deeply, from memory.
 * These are the calibration answer key: the felt scores here are what the
 * objective measurement model is ultimately trying to predict. Bled/Piran
 * should land near 10, Allison Park near 0 — if they don't, the instrument
 * is miscalibrated and nothing downstream can be trusted.
 */
export default function Baseline() {
  const { references, setReferenceSurvey } = usePlanner();
  const [active, setActive] = useState(null); // place name being surveyed

  const rated = baselineReferences.filter((r) => surveyComplete(references[r.name]));
  const progress = `${rated.length}/${baselineReferences.length}`;

  if (active) {
    const ref = baselineReferences.find((r) => r.name === active);
    return (
      <AppShell activeMode="baseline">
        <SurveyFlow
          title={ref.name}
          subtitle="From memory"
          context="memory"
          initial={references[active] || emptySurvey()}
          onSave={(survey) => { setReferenceSurvey(active, survey); setActive(null); }}
          onCancel={() => setActive(null)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell activeMode="baseline">
      <section className="canvas-header">
        <div>
          <h1>Rate the places you already know</h1>
          <p className="canvas-sub">
            These are the answer key. Rate them from memory using the same questionnaire you'll use after every visit — that's what makes new places comparable. Bled and Piran should land near 10; your own suburb near 0.
          </p>
        </div>
        <div className="felt-headline">
          <strong>{progress}</strong>
          <span>baselined</span>
        </div>
      </section>

      <ul className="baseline-list">
        {baselineReferences.map((ref) => {
          const survey = references[ref.name];
          const done = surveyComplete(survey);
          const felt = done ? feltScore(survey) : null;
          return (
            <li key={ref.name} className="baseline-row">
              <div className="baseline-main">
                <div className="baseline-score">
                  {done ? <strong>{felt.toFixed(0)}</strong> : <span className="baseline-score-empty">—</span>}
                </div>
                <div className="baseline-meta">
                  <strong>{ref.name}</strong>
                  <span>{ref.note}</span>
                  {done ? (
                    <div className="baseline-axes">
                      {surveyAxes.map((axis) => (
                        <span key={axis.key} className="baseline-axis-chip" title={axis.label}>
                          {axis.label.split(" ")[0]} {survey[axis.key]}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <button type="button" className={done ? "ghost" : "primary"} onClick={() => setActive(ref.name)}>
                {done ? "Re-rate" : "Rate from memory"}
              </button>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
