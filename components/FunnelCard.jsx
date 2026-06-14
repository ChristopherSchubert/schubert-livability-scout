"use client";

import {
  STAGES,
  STAGE_INDEX,
  cityImageQuery,
  cityStage,
  revisitLabel,
  weightedAxisScore,
} from "../lib/planner-data";
import { appendBust, resolveImage } from "./PlannerProvider";

// Defensive fallback when no weights are supplied. The Board always passes a
// concrete weight set (equal or learned), so this only guards stray callers.
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

/**
 * CityCard — compact draggable kanban card for the funnel Board.
 *
 * `usingLearnedWeights` must reflect whether the `weights` passed in are the
 * learned set (≥6 surveys) or equal weights; the score tooltip names the actual
 * weighting so it never asserts a false provenance (#85). Extracted from
 * FunnelBoard so the card renders — and is tested — in isolation.
 */
export function CityCard({ cityItem, imageState, weights, usingLearnedWeights, onOpen, onAdvance, onSendBack, onDragStart, onDragEnd, stage }) {
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
          <span className="funnel-card-score" title={`Overall measured score (${usingLearnedWeights ? "learned weights" : "equal weights"})`}>{score != null ? score.toFixed(1) : "—"}</span>
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
