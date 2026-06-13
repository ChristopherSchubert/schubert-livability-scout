"use client";

import { useState } from "react";
import { surveyAxes, SLOVENIA_ANCHORS, emptySurvey, surveyComplete } from "../lib/planner-data";

/**
 * SurveyFlow — the facilitated felt-score questionnaire.
 *
 * One axis per screen, each scored 1–5 against fixed anchors drawn from
 * places the owner has stood in, then the 0–10 "Gut score" and a
 * free note. Used for both baseline references (rated from memory) and
 * candidates (rated after a visit). Pure controlled component: it owns a
 * working copy, and commits the whole survey back via onSave.
 */
export default function SurveyFlow({ title, subtitle, context, initial, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({ ...emptySurvey(), ...(initial || {}) }));
  const [step, setStep] = useState(0);

  const steps = [
    ...surveyAxes.map((axis) => ({ kind: "axis", axis })),
    { kind: "slovenia" },
    { kind: "note" },
  ];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const commit = () => {
    onSave({
      ...draft,
      context: context || draft.context || "visited",
      takenAt: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <div className="survey-flow">
      <header className="survey-head">
        <div>
          <p className="canvas-eyebrow stage-decide-text">{subtitle}</p>
          <h1>{title}</h1>
        </div>
        <div className="survey-progress">
          {steps.map((_, i) => (
            <span key={i} className={`survey-dot${i === step ? " active" : ""}${i < step ? " done" : ""}`} />
          ))}
        </div>
      </header>

      <section className="survey-card">
        {current.kind === "axis" && (
          <AxisStep axis={current.axis} value={draft[current.axis.key]} onPick={(v) => set({ [current.axis.key]: v })} />
        )}
        {current.kind === "slovenia" && (
          <SloveniaStep value={draft.slovenia} onPick={(v) => set({ slovenia: v })} />
        )}
        {current.kind === "note" && (
          <NoteStep value={draft.note} onChange={(v) => set({ note: v })} />
        )}
      </section>

      <footer className="survey-foot">
        <div className="survey-foot-left">
          {step > 0 && <button type="button" className="ghost" onClick={() => setStep(step - 1)}>← Back</button>}
          {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
        </div>
        <div className="survey-foot-right">
          {!isLast ? (
            <button type="button" className="primary" onClick={() => setStep(step + 1)}>Next →</button>
          ) : (
            <button type="button" className="primary" disabled={!surveyComplete(draft)} onClick={commit}>
              {surveyComplete(draft) ? "Save survey" : "Answer all axes first"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function AxisStep({ axis, value, onPick }) {
  const labelId = `survey-q-${axis.key}`;
  return (
    <>
      <h2 id={labelId} className="survey-q">{axis.label}</h2>
      <p className="survey-prompt">{axis.prompt}</p>
      <div
        className="survey-anchors"
        role="radiogroup"
        aria-labelledby={labelId}
      >
        {axis.anchors.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={value === a.value}
            className={`survey-anchor${value === a.value ? " active" : ""}`}
            onClick={() => onPick(a.value)}
          >
            <span className="survey-anchor-num">{a.value}</span>
            <span className="survey-anchor-label">{a.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function SloveniaStep({ value, onPick }) {
  return (
    <>
      <h2 id="survey-q-gut" className="survey-q">The Gut score</h2>
      <p className="survey-prompt">Setting the breakdown aside — what does your gut say? How close did this get to the Bled / Piran feeling?</p>
      <div
        className="slovenia-scale"
        role="radiogroup"
        aria-labelledby="survey-q-gut"
      >
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`slovenia-tick${value === n ? " active" : ""}`}
            onClick={() => onPick(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="slovenia-anchors">
        {SLOVENIA_ANCHORS.map((a) => (
          <span key={a.value} className="slovenia-anchor"><b>{a.value}</b> {a.label}</span>
        ))}
      </div>
    </>
  );
}

function NoteStep({ value, onChange }) {
  return (
    <>
      <h2 className="survey-q">What made or broke it?</h2>
      <p className="survey-prompt">One or two sentences. The specific thing — “setting was there but the town felt hollow,” “fabric perfect but it was a gift-shop stage set.”</p>
      <textarea
        className="survey-note"
        rows={4}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="The one thing that decided it…"
        autoFocus
      />
    </>
  );
}
