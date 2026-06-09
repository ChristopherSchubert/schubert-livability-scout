"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  cityImageQuery,
  citySlug,
  cityStage,
  learnedAxisWeights,
  weeklyVisitScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { WorkspaceLoading } from "./Loading";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";

// Simplified PLANNING view for phones. The desktop planning surface is a
// pan/zoom swim-lane timeline (components/TripPlanner.jsx) — unusable on a
// phone. This distills its core question — "which candidates should I plan a
// trip for, and when?" — into a scannable, tappable list: each candidate shows
// its best upcoming visit window (the peak of the same weekly visit-score curve
// the timeline draws) and links to its per-city plan page to commit dates.
// PlanningView.jsx renders this at <=640px and TripPlanner above it.

const WEEKS = 53;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfWeek(d) {
  const out = startOfDay(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7)); // Monday = 0
  return out;
}
function addDays(d, n) { const out = startOfDay(d); out.setDate(out.getDate() + n); return out; }
function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}
function fromYmd(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function fmtDate(d) { return d ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : null; }
function fmtRange(a, b) {
  if (!a || !b) return null;
  const sameMonth = a.getMonth() === b.getMonth();
  return sameMonth
    ? `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${fmtDate(a)} – ${fmtDate(b)}`;
}

export default function PlanningMobile() {
  const { planner, hydrated, imageState } = usePlanner();

  const weights = useMemo(() => {
    const learned = learnedAxisWeights(planner.cities);
    return learned.weights || EQUAL_WEIGHTS;
  }, [planner.cities]);

  const { committed, queue, backlog } = useMemo(() => {
    const today = startOfDay(new Date());
    const viewStart = startOfWeek(new Date(today.getFullYear(), today.getMonth(), 1));
    const todayDay = daysBetween(viewStart, today);

    // Best upcoming week = peak of the weekly visit-score curve from today on.
    const bestWindow = (c) => {
      const scores = weeklyVisitScore(c, viewStart, WEEKS);
      let bestW = -1;
      let bestScore = -Infinity;
      if (scores) {
        for (let w = 0; w < WEEKS; w++) {
          if (w * 7 < todayDay) continue;
          if (scores[w] > bestScore) { bestScore = scores[w]; bestW = w; }
        }
      }
      return {
        city: c,
        overall: weightedAxisScore(c, weights),
        bestDate: bestW >= 0 ? addDays(viewStart, bestW * 7) : null,
        bestScore: bestW >= 0 ? bestScore : null,
      };
    };

    const committed = [];
    const queue = [];
    const backlog = [];
    for (const c of planner.cities) {
      if (c.isCalibration) continue; // reference places aren't trips to plan
      const stage = cityStage(c);
      if (stage === "planned") {
        const arrive = fromYmd(c.arriveDate);
        const depart = fromYmd(c.departDate);
        committed.push({
          city: c,
          overall: weightedAxisScore(c, weights),
          dates: fmtRange(arrive, depart) || c.tripWeek || "Dates TBD",
        });
      } else if (stage === "planning") {
        queue.push(bestWindow(c));
      } else if (stage === "backlog") {
        backlog.push(bestWindow(c));
      }
    }
    // Soonest strong window first.
    const byWindow = (a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1);
    queue.sort(byWindow);
    backlog.sort(byWindow);
    return { committed, queue, backlog };
  }, [planner.cities, weights]);

  function thumb(city) {
    return appendBust(resolveImage(city.heroImage, cityImageQuery(city.name), imageState), imageState.version);
  }

  return (
    <AppShell activeMode="planning">
      <section className="canvas-header plan-m-head">
        <div>
          <p className="page-eyebrow">Planning</p>
          <h1>When to visit</h1>
          <p className="canvas-sub">
            {!hydrated
              ? "Loading…"
              : "Each candidate's best upcoming visit window, ranked. Open one to lock its dates."}
          </p>
        </div>
        <Link className="ghost-link plan-m-cal" href="/planning/calendar">Calendar view →</Link>
      </section>

      {!hydrated ? (
        <WorkspaceLoading label="Loading candidates…" />
      ) : (
        <>
          {committed.length > 0 ? (
            <section className="plan-m-section">
              <h2 className="plan-m-section-head">Committed trips</h2>
              <ol className="plan-m-list">
                {committed.map(({ city, overall, dates }) => (
                  <PlanCard key={city.id} city={city} overall={overall} src={thumb(city)} primary={dates} primaryLabel="Dates" committed />
                ))}
              </ol>
            </section>
          ) : null}

          <section className="plan-m-section">
            <h2 className="plan-m-section-head">
              {queue.length > 0 ? "Looking for a slot" : "Nothing in planning"}
            </h2>
            {queue.length > 0 ? (
              <ol className="plan-m-list">
                {queue.map(({ city, overall, bestDate, bestScore }) => (
                  <PlanCard
                    key={city.id}
                    city={city}
                    overall={overall}
                    src={thumb(city)}
                    primary={bestDate ? fmtDate(bestDate) : "No window yet"}
                    primaryLabel="Best window"
                    badge={bestScore != null ? `${Math.round(bestScore)}/100` : null}
                  />
                ))}
              </ol>
            ) : (
              <div className="plan-m-empty">
                Move a candidate into Planning from the Board or Ranking to start
                scheduling its trip here.
              </div>
            )}
          </section>

          {backlog.length > 0 ? (
            <section className="plan-m-section">
              <h2 className="plan-m-section-head">
                Backlog <span className="plan-m-count">{backlog.length}</span>
              </h2>
              <p className="plan-m-sub">Candidates not yet in planning, by their best upcoming window.</p>
              <ol className="plan-m-list">
                {backlog.map(({ city, overall, bestDate, bestScore }) => (
                  <PlanCard
                    key={city.id}
                    city={city}
                    overall={overall}
                    src={thumb(city)}
                    primary={bestDate ? fmtDate(bestDate) : "No window yet"}
                    primaryLabel="Best window"
                    badge={bestScore != null ? `${Math.round(bestScore)}/100` : null}
                  />
                ))}
              </ol>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function PlanCard({ city, overall, src, primary, primaryLabel, badge, committed }) {
  const slug = citySlug(city);
  return (
    <li>
      <Link className={`plan-m-card${committed ? " is-committed" : ""}`} href={`/cities/${slug}/plan`}>
        {src ? (
          <img className="plan-m-thumb" src={src} alt="" loading="lazy" />
        ) : (
          <span className="plan-m-thumb plan-m-thumb-empty" aria-hidden="true">{city.name.slice(0, 1)}</span>
        )}
        <div className="plan-m-main">
          <div className="plan-m-top">
            <strong className="plan-m-name">{city.name}</strong>
            <span className="plan-m-overall">{overall != null ? overall.toFixed(1) : "—"}</span>
          </div>
          <div className="plan-m-window">
            <span className="plan-m-window-label">{primaryLabel}</span>
            <span className="plan-m-window-val">
              {primary}
              {badge ? <span className="plan-m-window-score">· {badge}</span> : null}
            </span>
          </div>
        </div>
        <span className="plan-m-go" aria-hidden="true">→</span>
      </Link>
    </li>
  );
}
