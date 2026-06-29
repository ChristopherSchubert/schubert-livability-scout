"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

// Backlog sort options. Both "window" and "soonest" use the best week from
// Sorting a backlog by each city's single best week is useless — every city
// has *some* good week, so it just ranks by an undifferentiated peak. The
// actionable lenses are: when can I next go (soonest), how good is the place
// (overall fit), and which cities suit a given season (best week in those
// months — the card re-windows to that season). The shown date is the visit
// window under the active lens.
const SORTS = [
  { id: "soonest", label: "Soonest first", chip: "Next window" },
  { id: "overall", label: "Overall fit", chip: "Next window" },
  { id: "spring", label: "Best in spring", chip: "Spring", months: [2, 3, 4] },
  { id: "summer", label: "Best in summer", chip: "Summer", months: [5, 6, 7] },
  { id: "fall", label: "Best in fall", chip: "Fall", months: [8, 9, 10] },
  { id: "winter", label: "Best in winter", chip: "Winter", months: [11, 0, 1] },
];
const SORT_BY_ID = Object.fromEntries(SORTS.map((s) => [s.id, s]));

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

// Best visit window for a city under a given lens. With `months` (a season), the
// peak week whose midpoint falls in those months; otherwise the peak week from
// `todayDay` forward (the soonest upcoming window). Returns { date, score }.
function windowFor(city, viewStart, todayDay, months) {
  const scores = weeklyVisitScore(city, viewStart, WEEKS);
  if (!scores) return { date: null, score: null };
  let bestW = -1;
  let bestScore = -Infinity;
  for (let w = 0; w < WEEKS; w++) {
    if (months) {
      if (!months.includes(addDays(viewStart, w * 7 + 3).getMonth())) continue;
    } else if (w * 7 < todayDay) {
      continue;
    }
    if (scores[w] > bestScore) { bestScore = scores[w]; bestW = w; }
  }
  return {
    date: bestW >= 0 ? addDays(viewStart, bestW * 7) : null,
    score: bestW >= 0 ? bestScore : null,
  };
}

export default function PlanningMobile() {
  const { planner, hydrated, imageState } = usePlanner();

  const weights = useMemo(() => {
    const learned = learnedAxisWeights(planner.cities);
    return learned.weights || EQUAL_WEIGHTS;
  }, [planner.cities]);

  const [sort, setSort] = useState("soonest");

  const frame = useMemo(() => {
    const today = startOfDay(new Date());
    const viewStart = startOfWeek(new Date(today.getFullYear(), today.getMonth(), 1));
    return { viewStart, todayDay: daysBetween(viewStart, today) };
  }, []);

  // Committed trips + the planning queue — sort-independent (the queue always
  // leads with its soonest strong window).
  const { committed, queue } = useMemo(() => {
    const { viewStart, todayDay } = frame;
    const committed = [];
    const queue = [];
    for (const c of planner.cities) {
      if (c.isCalibration) continue; // reference places aren't trips to plan
      const stage = cityStage(c);
      if (stage === "planned") {
        committed.push({
          city: c,
          overall: weightedAxisScore(c, weights),
          dates: fmtRange(fromYmd(c.arriveDate), fromYmd(c.departDate)) || c.tripWeek || "Dates TBD",
        });
      } else if (stage === "planning") {
        const w = windowFor(c, viewStart, todayDay, null);
        queue.push({ city: c, overall: weightedAxisScore(c, weights), bestDate: w.date, bestScore: w.score });
      }
    }
    queue.sort((a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1));
    return { committed, queue };
  }, [planner.cities, weights, frame]);

  // Backlog — re-sorted (and re-windowed for season lenses) by the chosen sort.
  const backlog = useMemo(() => {
    const { viewStart, todayDay } = frame;
    const months = SORT_BY_ID[sort]?.months || null;
    const rows = [];
    for (const c of planner.cities) {
      if (c.isCalibration || cityStage(c) !== "backlog") continue;
      const w = windowFor(c, viewStart, todayDay, months);
      rows.push({ city: c, overall: weightedAxisScore(c, weights), bestDate: w.date, bestScore: w.score });
    }
    const time = (r) => (r.bestDate ? r.bestDate.getTime() : Infinity);
    const byOverall = (a, b) => (b.overall ?? -1) - (a.overall ?? -1);
    rows.sort(
      sort === "overall"
        ? byOverall
        : sort === "soonest"
          // earliest visit window first; ties broken by the place's fit
          ? (a, b) => time(a) - time(b) || byOverall(a, b)
          // season lens: best week in that season, ranked by its quality
          : (a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1));
    return rows;
  }, [planner.cities, weights, frame, sort]);

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
            {!hydrated ? "Loading…" : "When to visit each candidate. Tap to lock dates."}
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
                    primaryLabel="Next window"
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
              <div className="plan-m-section-bar">
                <h2 className="plan-m-section-head">
                  Backlog <span className="plan-m-count">{backlog.length}</span>
                </h2>
                <label className="plan-m-sort">
                  <span className="plan-m-sort-label">Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort backlog">
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <ol className="plan-m-list">
                {backlog.map(({ city, overall, bestDate, bestScore }) => (
                  <PlanCard
                    key={city.id}
                    city={city}
                    overall={overall}
                    src={thumb(city)}
                    primary={bestDate ? fmtDate(bestDate) : "No window yet"}
                    primaryLabel={SORT_BY_ID[sort]?.chip || "Next window"}
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
      <Link className={`plan-m-card${committed ? " is-committed" : ""}`} href={`/cities/${slug}`}>
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
