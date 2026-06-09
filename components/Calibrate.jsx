"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MONTHS,
  calibrateAxes,
  cityImageQuery,
  citySlug,
  learnedAxisWeights,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import FunnelHeader from "./FunnelHeader";
import { WorkspaceLoading } from "./Loading";
import { appendBust, resolveImage, usePlanner } from "./PlannerProvider";
import ViewToggle from "./ViewToggle";
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
 * Calibrate — sortable, filterable ranking table.
 *
 * Columns are the five measured axes (each an absolute 0–10 from the cited
 * metrics) plus an Overall = weighted average and a Visit-now (this month's
 * climate comfort, informational only). Sort by clicking any header; SHIFT-
 * click to add a secondary sort. The Overall weights are LEARNED from the
 * owner's gut once ≥6 places are rated; until then the axes count equally.
 *
 * Filters live in a slide-in drawer to keep the toolbar light — the same
 * drawer is reused on the Board (see components/city-filters.jsx).
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner, imageState, hydrated } = usePlanner();
  const filters = useCityFilters();
  const [sort, setSort] = useState([{ key: "overall", dir: "desc" }]);
  const [hideCalibration, setHideCalibration] = useState(true);

  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const learned = useMemo(() => learnedAxisWeights(planner.cities), [planner.cities]);
  const equalWeights = useMemo(() => Object.fromEntries(calibrateAxes.map(([k]) => [k, 1])), []);
  const weights = learned.weights || equalWeights;

  const cityRows = useMemo(() => visibleCities.map((cityItem) => ({
    ...augmentCityForFilters(cityItem),
    overall: weightedAxisScore(cityItem, weights),
    visitNow: visitNowScore(cityItem, filters.nowMonth),
  })), [visibleCities, weights, filters.nowMonth]);

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
  }, [cityRows, filters, sort]);

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

  return (
    <AppShell activeMode="board">
      <FunnelHeader
        meta={
          !hydrated
            ? "Loading…"
            : `${rows.length} of ${cityRows.length} candidates${filters.activeFilterCount > 0 ? " match filters" : ""}`
        }
      />
      <section className="rank-controls">
        <ViewToggle active="ranking" />
        <input
          type="search"
          className="rank-search"
          placeholder="Search city name…"
          aria-label="Search city name"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
        />
        <CityFiltersBar filters={filters} />
        <span className="rank-controls-spacer" />
        {calCount > 0 ? (
          <label className="rank-toggle">
            <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
            Hide calibration ({calCount})
          </label>
        ) : null}
      </section>

      {!hydrated ? <WorkspaceLoading label="Loading cities…" /> : (
      <section className="rank-table-wrap">
        <div className="rank-count">
          <WeightNote learned={learned} />
        </div>
        <table className="rank-table">
          <thead>
            <tr>
              <th className="rt-rank">#</th>
              <th className="rt-city sortable" onClick={(e) => clickSort("city", e)}>City{sortBadge("city")}</th>
              {calibrateAxes.map(([key, label]) => (
                <th key={key} className="rt-axis sortable" onClick={(e) => clickSort(key, e)} title={label}>
                  {shortAxisLabel(label)}{sortBadge(key)}
                  {learned.weights ? <span className="rt-weight">×{(weights[key] ?? 1).toFixed(1)}</span> : null}
                </th>
              ))}
              <th className="rt-overall sortable" onClick={(e) => clickSort("overall", e)}>Overall{sortBadge("overall")}</th>
              <th className="rt-visitnow sortable" onClick={(e) => clickSort("visitnow", e)} title="How good this month is to visit: climate comfort now, nudged up when the next two months get worse. Not part of the fit score.">
                Visit now<span className="rt-weight">{MONTHS[filters.nowMonth]}</span>{sortBadge("visitnow")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const slug = citySlug(row.cityItem);
              const heroQuery = cityImageQuery(row.cityItem.name, row.cityItem.stayZone, row.cityItem.heartIntersection);
              const heroSrc = appendBust(resolveImage(row.cityItem.heroImage, heroQuery, imageState), imageState.version);
              return (
                <tr key={row.cityItem.id} className="rt-row" onClick={() => router.push(`/cities/${slug}`)}>
                  <td className="rt-rank">{i + 1}</td>
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
                  {calibrateAxes.map(([key, label]) => (
                    <td key={key} className="rt-axis" data-label={shortAxisLabel(label)}><ScoreCell value={row.roll[key]} /></td>
                  ))}
                  <td className="rt-overall" data-label="Overall">{row.overall != null ? row.overall.toFixed(2) : "—"}</td>
                  <td className="rt-visitnow" data-label="Visit now"><ScoreCell value={row.visitNow} /></td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={3 + calibrateAxes.length + 2} className="rt-empty">No cities match these filters.</td></tr>
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
        {"Weights learned: "}
        {calibrateAxes.map(([k, l], i) => (
          <span key={k}>{i ? " · " : ""}{shortAxisLabel(l)}×{(learned.weights[k] ?? 1).toFixed(1)}</span>
        ))}
      </span>
    );
  }
  return (
    <span className="weight-note-inline" title="Survey visited cities (give each a Gut score) so Overall can learn which axes predict your gut.">
      {`Axes equal-weighted (${learned.n}/${learned.need} surveyed)`}
    </span>
  );
}
