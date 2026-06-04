"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  cityImageQuery,
  cityStage,
  citySlug,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { resolveImage, usePlanner } from "./PlannerProvider";

// Equal-weight measured composite — same engine as Detail / Board.
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

const DECISIONS = ["Advance", "Winter Revisit", "Eliminate"];

/**
 * DecidedArchive — purpose-built page for the Decided stage.
 *
 * Not a kanban column. A filterable archive of cities you've ruled on,
 * grouped by verdict. The point is to see your decisions as a portfolio:
 * what advanced, what got winter-revisited, what dropped out.
 */
export default function DecidedArchive() {
  const { planner, imageState } = usePlanner();
  const [filter, setFilter] = useState("All");

  const decided = useMemo(() => {
    return planner.cities.filter((cityItem) => cityStage(cityItem) === "decided");
  }, [planner.cities]);

  const counts = useMemo(() => {
    const tally = { All: decided.length };
    DECISIONS.forEach((decision) => {
      tally[decision] = decided.filter((cityItem) => normalizeDecision(cityItem) === decision).length;
    });
    return tally;
  }, [decided]);

  const visible = useMemo(() => {
    const list = filter === "All" ? decided : decided.filter((cityItem) => normalizeDecision(cityItem) === filter);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [decided, filter]);

  return (
    <AppShell activeMode="decided">
      <section className="canvas-header">
        <div>
          <h1>Verdict archive</h1>
          <p className="canvas-sub">{decided.length === 0 ? "No verdicts in yet. Decisions you make on the Decide page land here." : `${decided.length} ${decided.length === 1 ? "verdict" : "verdicts"} on record. Filter by outcome to see the portfolio.`}</p>
        </div>
      </section>

      {decided.length === 0 ? (
        <EmptyState
          title="No verdicts yet"
          body="Cities you advance, winter-revisit, or eliminate will appear here as a portfolio of decisions."
          href="/decide"
          cta="Go to Decide"
        />
      ) : (
        <>
          <nav className="archive-filter" aria-label="Filter by decision">
            {["All", ...DECISIONS].map((option) => (
              <button
                key={option}
                type="button"
                className={`archive-chip${filter === option ? " active" : ""} ${chipClass(option)}`}
                onClick={() => setFilter(option)}
              >
                <span>{option}</span>
                <span className="archive-chip-count">{counts[option]}</span>
              </button>
            ))}
          </nav>

          {visible.length === 0 ? (
            <p className="archive-empty">No verdicts of this kind yet.</p>
          ) : (
            <ul className="archive-list">
              {visible.map((cityItem) => {
                const slug = citySlug(cityItem);
                const heroQuery = cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection);
                const heroSrc = resolveImage(cityItem.heroImage, heroQuery, imageState);
                const measured = weightedAxisScore(cityItem, EQUAL_WEIGHTS);
                const avg = measured != null ? measured.toFixed(1) : "—";
                const decision = normalizeDecision(cityItem);
                const memo = (cityItem.decisionMemo || cityItem.firstImpressions || "").trim();
                return (
                  <li key={cityItem.id} className="archive-row">
                    <div className="archive-media">
                      {heroSrc ? <img src={heroSrc} alt="" /> : <div className="archive-media-fallback" aria-hidden="true">{cityItem.name.slice(0, 1)}</div>}
                    </div>
                    <div className="archive-body">
                      <header className="archive-head">
                        <Link className="archive-name" href={`/cities/${slug}/decide`}>{cityItem.name}</Link>
                        <span className="archive-score">{avg}</span>
                        <span className={`decision-chip ${chipClass(decision)}`}>{decision}</span>
                      </header>
                      {memo ? <p className="archive-memo">{truncate(memo, 220)}</p> : <p className="archive-memo archive-memo-empty">No memo recorded.</p>}
                    </div>
                    <Link className="ghost-link" href={`/cities/${slug}/decide`}>Open</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}

function normalizeDecision(cityItem) {
  const value = cityItem.decision || "";
  if (DECISIONS.includes(value)) return value;
  if (cityItem.status === "Eliminated") return "Eliminate";
  return "Advance";
}

function chipClass(value) {
  return (value || "").toLowerCase().replace(/\s+/g, "-");
}

function truncate(value, max) {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function EmptyState({ title, body, href, cta }) {
  return (
    <section className="workspace-empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {href ? <Link className="button-link" href={href}>{cta}</Link> : null}
    </section>
  );
}
