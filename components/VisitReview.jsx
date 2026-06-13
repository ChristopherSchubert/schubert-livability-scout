"use client";

import { useState } from "react";
import { surveyAxes, feltScore, surveyComplete } from "../lib/planner-data";
import AppShell, { defaultCityNav } from "./AppShell";
import SurveyFlow from "./SurveyFlow";
import { usePlanner } from "./PlannerProvider";

/**
 * VisitReview — the felt-score questionnaire for a place, run after a visit.
 * If not yet surveyed (or the user hits "Re-survey"), shows the facilitated
 * SurveyFlow. Otherwise shows the recorded result: the Gut score,
 * the five diagnostic axes, and the note. Closes on the kept "would you go
 * back?" question — never a verdict on where to live.
 */
export default function VisitReview({ cityItem }) {
  const { updateCity } = usePlanner();
  const [editing, setEditing] = useState(false);
  const cityNav = defaultCityNav(cityItem, "assess");
  const survey = cityItem.survey || {};
  const done = surveyComplete(survey);

  const save = (next) => {
    // First survey after a trip marks the city Visited. Re-surveying a city
    // that's already visited / eliminated / decided must NOT revert its status
    // (that decoupled status from `decision` — #71).
    const decided = ["Advance", "Winter Revisit", "Eliminate"].includes(cityItem.decision);
    const patch = { survey: next };
    if (cityItem.status !== "Visited" && cityItem.status !== "Eliminated" && !decided) {
      patch.status = "Visited";
    }
    updateCity(cityItem.id, patch);
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

        {/* Would you go back? — the post-visit verdict. Makes all three decisions
            reachable (Winter Revisit had no control anywhere before, #71) and
            frames them as the kept "should we go back?" question. */}
        <div className="decide-verdict">
          <span className="decide-verdict-label">Would you go back?</span>
          <div className="decide-verdict-opts">
            {[["Advance", "Yes — go back"], ["Winter Revisit", "Maybe — winter revisit"], ["Eliminate", "Probably not"]].map(([val, label]) => (
              <button key={val} type="button"
                className={`decide-verdict-opt${cityItem.decision === val ? " on" : ""}`}
                aria-pressed={cityItem.decision === val}
                onClick={() => updateCity(cityItem.id, { decision: cityItem.decision === val ? "Undecided" : val })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="ghost" onClick={() => setEditing(true)}>Re-survey</button>
      </section>
    </AppShell>
  );
}
