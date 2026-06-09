"use client";

import { useState } from "react";
import { surveyAxes, feltScore, surveyComplete } from "../lib/planner-data";
import AppShell, { defaultCityNav } from "./AppShell";
import SurveyFlow from "./SurveyFlow";
import { usePlanner } from "./PlannerProvider";

/**
 * Decide — the felt-score questionnaire for a candidate, run after a visit.
 * If not yet surveyed (or the user hits "Re-survey"), shows the facilitated
 * SurveyFlow. Otherwise shows the recorded result: the Gut score,
 * the five diagnostic axes, and the note.
 */
export default function Decide({ cityItem }) {
  const { updateCity } = usePlanner();
  const [editing, setEditing] = useState(false);
  const cityNav = defaultCityNav(cityItem, "assess");
  const survey = cityItem.survey || {};
  const done = surveyComplete(survey);

  const save = (next) => {
    updateCity(cityItem.id, { survey: next, status: "Visited" });
    setEditing(false);
  };

  if (!done || editing) {
    return (
      <AppShell activeMode="assess" cityItem={cityItem} cityNav={cityNav}>
        <SurveyFlow
          title={cityItem.name}
          subtitle="After the visit"
          context="visited"
          initial={survey}
          onSave={save}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      </AppShell>
    );
  }

  return (
    <AppShell activeMode="assess" cityItem={cityItem} cityNav={cityNav}>
      <section className="survey-result-head">
        <div className="felt-headline">
          <strong>{feltScore(survey).toFixed(0)}</strong>
          <span>Gut score · surveyed {survey.takenAt || "recently"}</span>
        </div>
      </section>

      <section className="survey-result">
        <div className="survey-result-axes">
          {surveyAxes.map((axis) => (
            <div key={axis.key} className="survey-result-axis">
              <span className="survey-result-axis-label">{axis.label}</span>
              <div className="survey-result-bar">
                <span className="survey-result-fill" style={{ width: `${(survey[axis.key] / 5) * 100}%` }} />
              </div>
              <span className="survey-result-val">{survey[axis.key]}/5</span>
            </div>
          ))}
        </div>
        {survey.note ? (
          <blockquote className="survey-result-note">{survey.note}</blockquote>
        ) : null}
        <button type="button" className="ghost" onClick={() => setEditing(true)}>Re-survey</button>
      </section>
    </AppShell>
  );
}
