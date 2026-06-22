"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MONTHS,
  calibrateAxes,
  cityImageQuery,
  cityVisitWindow,
  citySlug,
  learnedAxisWeights,
  monthlyComfortScores,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import FunnelHeader from "./FunnelHeader";
import { WorkspaceLoading } from "./Loading";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";
import ViewToggle from "./ViewToggle";
import YearSparkline from "./YearSparkline";
import {
  CityFilterDrawer,
  CityFiltersBar,
  applyCityFilters,
  augmentCityForFilters,
  availableFilterOptions,
  shortAxisLabel,
  useCityFilters,
} from "./city-filters";

/**
 * Compare — a sortable, filterable table of places to explore, organized around
 * WHEN each one is good to visit (#68). This is a vacation app, not a decision
 * tool, so the view doesn't rank places toward a verdict: it leads with "great
 * in [month]" (climate comfort + a don't-miss-it nudge) and a 12-month
 * sparkline showing each place's year-shape. Pick the month you're thinking of
 * travelling and the table reorders to what's lovely then.
 *
 * The measured axis columns and the learned "Fit" (a weighted average of the
 * five axes, weights LEARNED from the owner's gut once ≥6 places are rated) stay
 * as honest signals you can sort by — Fit is one lens among several, not the
 * answer. Sort by clicking any header; SHIFT-click adds a secondary sort.
 *
 * Filters live in a slide-in drawer to keep the toolbar light — the same drawer
 * is reused on the Board (see components/city-filters.jsx).
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner, imageState, hydrated } = usePlanner();
  const filters = useCityFilters();
  const [sort, setSort] = useState([{ key: "visitnow", dir: "desc" }]);
  const [hideCalibration, setHideCalibration] = useState(true);

  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const learned = useMemo(() => learnedAxisWeights(planner.cities), [planner.cities]);
  const equalWeights = useMemo(() => Object.fromEntries(calibrateAxes.map(([k]) => [k, 1])), []);
  const weights = learned.weights || equalWeights;

  const cityRows = useMemo(() => visibleCities.map((cityItem) => {
    const win = cityVisitWindow(cityItem);
    return {
      ...augmentCityForFilters(cityItem),
      overall: weightedAxisScore(cityItem, weights),
      visitNow: visitNowScore(cityItem, filters.nowMonth),
      series: monthlyComfortScores(cityItem),
      // Mark the recommended Prime window on the sparkline. Off-season's
      // detail (and its colour key) lives on the city page's fuller strip —
      // a third tick crowds a 116px chart and reads as a stray mark (#68).
      primeIdx: win?.prime?.idx ?? null,
    };
  }), [visibleCities, weights, filters.nowMonth]);

  const options = useMemo(() => availableFilterOptions(cityRows), [cityRows]);

  const rows = useMemo(() => {
    const data = applyCityFilters(cityRows, filters);
    const val = (row, key) =>
      key === "overall" ? row.overall : key === "visitnow" ? row.visitNow : key === "city" ? row.cityItem.name : row.roll[key];
    return [...data].sort((a, b) => {
      for (const { key, dir } of sort) {
        const av = val(a, key), bv = val(b, key);
        const factor = dir === "asc" ? 1 : -1;
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
        if (cmp !== 0) return cmp * factor;
      }
      return 0;
    });
  // Depend on primitive fields rather than the filters object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityRows, filters.query, filters.regions, filters.states, filters.chipFilters, filters.chipMode, filters.axisMins, filters.visitNowMin, sort]);

  function clickSort(key, e) {
    const shift = e.shiftKey;
    setSort((cur) => {
      const existing = cur.find((s) => s.key === key);
      const defaultDir = key === "city" ? "asc" : "desc";
      if (shift) {
        if (!existing) return [...cur, { key, dir: defaultDir }];
        return cur.map((s) => (s.key === key ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s));
      }
      if (cur[0]?.key === key) return [{ key, dir: cur[0].dir === "asc" ? "desc" : "asc" }];
      return [{ key, dir: existing?.dir ?? defaultDir }];
    });
  }
  function sortBadge(key) {
    const i = sort.findIndex((s) => s.key === key);
    if (i < 0) return "";
    const arr = sort[i].dir === "asc" ? "↑" : "↓";
    return sort.length > 1 ? ` ${arr}${i + 1}` : ` ${arr}`;
  }

  const monthName = MONTHS[filters.nowMonth];

  return (
    <AppShell activeMode="board">
      <FunnelHeader
        meta={
          !hydrated
            ? "Loading…"
            : `${rows.length} of ${cityRows.length} places${filters.activeFilterCount > 0 ? " match filters" : ""}`
        }
      />
      <section className="rank-controls">
        <ViewToggle active="ranking" />
        <label className="rank-month">
          <span className="rank-month-label">Best to visit in</span>
          <select
            className="rank-month-select"
            value={filters.nowMonth}
            onChange={(e) => filters.setNowMonth(Number(e.target.value))}
            aria-label="Month to compare visit comfort"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
        </label>
        <input
          type="search"
          className="rank-search"
          placeholder="Search a place…"
          aria-label="Search place name"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
        />
        <CityFiltersBar filters={filters} />
        <span className="rank-controls-spacer" />
        {calCount > 0 ? (
          <label className="rank-toggle">
            <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
            Hide reference places ({calCount})
          </label>
        ) : null}
      </section>

      {!hydrated ? <WorkspaceLoading label="Loading places…" /> : (
      <section className="rank-table-wrap">
        <div className="rank-count">
          <WeightNote learned={learned} />
        </div>
        <table className="rank-table">
          <thead>
            <tr>
              <th className="rt-city sortable" onClick={(e) => clickSort("city", e)}>Place{sortBadge("city")}</th>
              <th className="rt-when sortable" onClick={(e) => clickSort("visitnow", e)} title={`How good ${monthName} is to visit: climate comfort that month, nudged up when the next two months get worse so you don't miss a prime window.`}>
                Great in {monthName}{sortBadge("visitnow")}
              </th>
              <th className="rt-spark-col">Year</th>
              {calibrateAxes.map(([key, label]) => (
                <th key={key} className="rt-axis sortable" onClick={(e) => clickSort(key, e)} title={label}>
                  {shortAxisLabel(label)}{sortBadge(key)}
                  {learned.weights ? <span className="rt-weight">×{(weights[key] ?? 1).toFixed(1)}</span> : null}
                </th>
              ))}
              <th className="rt-overall sortable" onClick={(e) => clickSort("overall", e)} title="Fit: weighted average of the five measured axes (weights learned from your gut scores). One signal among several — not a verdict.">
                Fit{sortBadge("overall")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const slug = citySlug(row.cityItem);
              const heroQuery = cityImageQuery(row.cityItem.name, row.cityItem.stayZone, row.cityItem.heartIntersection);
              const heroSrc = appendBust(resolveImage(row.cityItem.heroImage, heroQuery, imageState), imageState.version);
              return (
                <tr key={row.cityItem.id} className="rt-row" onClick={() => router.push(`/cities/${slug}`)}>
                  <td className="rt-city">
                    <div className="rt-city-inner">
                      {heroSrc ? (
                        <img className="rt-city-thumb" src={heroSrc} alt="" loading="lazy" />
                      ) : (
                        <span className="rt-city-thumb rt-city-thumb-empty" aria-hidden="true" />
                      )}
                      <div className="rt-city-text">
                        <strong>{row.cityItem.name}</strong>
                        <span>{row.cityItem.stayZone || "—"}</span>
                      </div>
                    </div>
                  </td>
                  <td className="rt-when" data-label={`Great in ${monthName}`}><ScoreCell value={row.visitNow} /></td>
                  <td className="rt-spark-col" data-label="Year">
                    <YearSparkline series={row.series} selectedMonth={filters.nowMonth} primeIdx={row.primeIdx} />
                  </td>
                  {calibrateAxes.map(([key, label]) => (
                    <td key={key} className="rt-axis" data-label={shortAxisLabel(label)}><ScoreCell value={row.roll[key]} /></td>
                  ))}
                  <td className="rt-overall" data-label="Fit">{row.overall != null ? row.overall.toFixed(2) : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={4 + calibrateAxes.length} className="rt-empty">No places match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
      )}

      <CityFilterDrawer filters={filters} options={options} />
    </AppShell>
  );
}

function ScoreCell({ value }) {
  if (value == null) return <span className="rt-na">—</span>;
  const hue = Math.round(value * 12);
  return <span className="rt-score" style={{ background: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 45% 30%)` }}>{value.toFixed(1)}</span>;
}

function WeightNote({ learned }) {
  if (learned.weights) {
    return (
      <span className="weight-note-inline" title={`Learned from ${learned.n} surveyed visits (cities with a Gut score)`}>
        {"Fit weights learned: "}
        {calibrateAxes.map(([k, l], i) => (
          <span key={k}>{i ? " · " : ""}{shortAxisLabel(l)}×{(learned.weights[k] ?? 1).toFixed(1)}</span>
        ))}
      </span>
    );
  }
  return (
    <span className="weight-note-inline" title="Survey visited cities (give each a Gut score) so Fit can learn which axes predict your gut.">
      {`Fit axes equal-weighted (${learned.n}/${learned.need} surveyed)`}
    </span>
  );
}
