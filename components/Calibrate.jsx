"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MONTHS,
  axisRollup,
  calibrateAxes,
  citySlug,
  learnedAxisWeights,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import AppShell from "./AppShell";
import { usePlanner } from "./PlannerProvider";

/**
 * Calibrate — sortable, filterable ranking table.
 *
 * Columns are the five measured axes (each an absolute 0–10 from the cited
 * metrics) plus an Overall = weighted average and a Visit-now (this month's
 * climate comfort, informational only). Sort by clicking any header; SHIFT-
 * click to add a secondary sort. Filter by city-name search and per-axis min
 * thresholds. The Overall weights are LEARNED from the owner's gut once ≥6
 * places are rated; until then the axes count equally and the page says so.
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner } = usePlanner();
  // sort = ordered list of {key, dir} — first is primary, rest are tiebreakers.
  const [sort, setSort] = useState([{ key: "overall", dir: "desc" }]);
  const [hideCalibration, setHideCalibration] = useState(true);
  const [query, setQuery] = useState("");
  // axisMins: per-axis min threshold (0–10) and a global "Visit now" min.
  const [axisMins, setAxisMins] = useState({}); // {setting: 5, …}
  const [visitNowMin, setVisitNowMin] = useState(0);
  const [nowMonth] = useState(() => new Date().getMonth());

  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const learned = useMemo(() => learnedAxisWeights(planner.cities), [planner.cities]);
  const equalWeights = useMemo(() => Object.fromEntries(calibrateAxes.map(([k]) => [k, 1])), []);
  const weights = learned.weights || equalWeights;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const data = visibleCities
      .map((cityItem) => {
        const roll = axisRollup(cityItem);
        return {
          cityItem,
          roll,
          overall: weightedAxisScore(cityItem, weights),
          visitNow: visitNowScore(cityItem, nowMonth),
          measured: calibrateAxes.some(([k]) => roll[k] != null),
        };
      })
      .filter((row) => {
        if (needle && !row.cityItem.name.toLowerCase().includes(needle)) return false;
        for (const [key] of calibrateAxes) {
          const min = axisMins[key];
          if (min != null && min > 0 && (row.roll[key] == null || row.roll[key] < min)) return false;
        }
        if (visitNowMin > 0 && (row.visitNow == null || row.visitNow < visitNowMin)) return false;
        return true;
      });

    // Multi-column sort: apply criteria in order, fall through ties.
    const val = (row, key) =>
      key === "overall" ? row.overall : key === "visitnow" ? row.visitNow : key === "city" ? row.cityItem.name : row.roll[key];
    return data.sort((a, b) => {
      for (const { key, dir } of sort) {
        const av = val(a, key), bv = val(b, key);
        const factor = dir === "asc" ? 1 : -1;
        if (av == null && bv == null) continue;
        if (av == null) return 1; // nulls always last
        if (bv == null) return -1;
        const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
        if (cmp !== 0) return cmp * factor;
      }
      return 0;
    });
  }, [visibleCities, weights, sort, nowMonth, query, axisMins, visitNowMin]);

  // Click = set primary sort (or toggle direction if same key).
  // Shift-click = add/update as secondary sort.
  function clickSort(key, e) {
    const shift = e.shiftKey;
    setSort((cur) => {
      const existing = cur.find((s) => s.key === key);
      const defaultDir = key === "city" ? "asc" : "desc";
      if (shift) {
        // Add or flip in place
        if (!existing) return [...cur, { key, dir: defaultDir }];
        return cur.map((s) => (s.key === key ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s));
      }
      // Plain click: if already primary, flip; else become primary alone.
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

  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    Object.values(axisMins).filter((v) => v > 0).length +
    (visitNowMin > 0 ? 1 : 0);

  const clearFilters = () => { setQuery(""); setAxisMins({}); setVisitNowMin(0); };

  return (
    <AppShell activeMode="calibrate">
      <section className="canvas-header">
        <div>
          <p className="canvas-eyebrow stage-calibrate-text">Ranking</p>
          <h1>Rank by measured fit</h1>
          <p className="canvas-sub">
            Each column is a measured axis scored 0–10 from the cited metrics. <strong>Overall</strong> is their weighted average. Click a header to sort; <strong>shift-click</strong> to add a secondary sort.
          </p>
        </div>
      </section>

      <WeightNote learned={learned} />

      <section className="rank-controls">
        <input
          type="search"
          className="rank-search"
          placeholder="Search city name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {calibrateAxes.map(([key, label]) => (
          <AxisMinControl key={key} label={shortLabel(label)} value={axisMins[key] ?? 0} onChange={(v) => setAxisMins((m) => ({ ...m, [key]: v }))} />
        ))}
        <AxisMinControl label={`Visit now (${MONTHS[nowMonth]})`} value={visitNowMin} onChange={setVisitNowMin} />
        {calCount > 0 ? (
          <label className="rank-toggle">
            <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
            Hide calibration ({calCount})
          </label>
        ) : null}
        {activeFilterCount > 0 ? (
          <button type="button" className="rank-clear" onClick={clearFilters}>Clear filters ({activeFilterCount})</button>
        ) : null}
      </section>

      <section className="rank-table-wrap">
        <div className="rank-count">{rows.length} of {visibleCities.length} candidates{activeFilterCount > 0 ? " match filters" : ""}</div>
        <table className="rank-table">
          <thead>
            <tr>
              <th className="rt-rank">#</th>
              <th className="rt-city sortable" onClick={(e) => clickSort("city", e)}>City{sortBadge("city")}</th>
              {calibrateAxes.map(([key, label]) => (
                <th key={key} className="rt-axis sortable" onClick={(e) => clickSort(key, e)} title={label}>
                  {shortLabel(label)}{sortBadge(key)}
                  {learned.weights ? <span className="rt-weight">×{(weights[key] ?? 1).toFixed(1)}</span> : null}
                </th>
              ))}
              <th className="rt-overall sortable" onClick={(e) => clickSort("overall", e)}>Overall{sortBadge("overall")}</th>
              <th className="rt-visitnow sortable" onClick={(e) => clickSort("visitnow", e)} title="How good this month is to visit, by climate comfort. Not part of the fit score.">
                Visit now<span className="rt-weight">{MONTHS[nowMonth]}</span>{sortBadge("visitnow")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const slug = citySlug(row.cityItem);
              return (
                <tr key={row.cityItem.id} className="rt-row" onClick={() => router.push(`/cities/${slug}`)}>
                  <td className="rt-rank">{i + 1}</td>
                  <td className="rt-city">
                    <strong>{row.cityItem.name}</strong>
                    <span>{row.cityItem.stayZone || "—"}</span>
                  </td>
                  {calibrateAxes.map(([key]) => (
                    <td key={key} className="rt-axis"><ScoreCell value={row.roll[key]} /></td>
                  ))}
                  <td className="rt-overall">{row.overall != null ? row.overall.toFixed(2) : "—"}</td>
                  <td className="rt-visitnow"><ScoreCell value={row.visitNow} /></td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={3 + calibrateAxes.length + 2} className="rt-empty">No cities match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

// Compact 0–10 min-threshold slider used in the toolbar. Reads "≥ N" so it's
// clear it's a floor, not a target. Showing 0 means "no filter."
function AxisMinControl({ label, value, onChange }) {
  const active = value > 0;
  return (
    <label className={`rank-axis-min${active ? " active" : ""}`}>
      <span className="rank-axis-min-label">{label}</span>
      <input
        type="range" min={0} max={10} step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`Minimum ${label} score`}
      />
      <span className="rank-axis-min-value">{active ? `≥${value.toFixed(1)}` : "any"}</span>
    </label>
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
      <p className="weight-note weight-note-learned">
        <strong>Overall weights learned from your {learned.n} gut ratings</strong> — how well each axis predicts your felt Slovenia score:{" "}
        {calibrateAxes.map(([k, l], i) => (
          <span key={k}>{i ? " · " : ""}{shortLabel(l)} ×{(learned.weights[k] ?? 1).toFixed(1)}</span>
        ))}
      </p>
    );
  }
  return (
    <p className="weight-note">
      Axes count <strong>equally</strong> for now. Rate ≥{learned.need} places by gut on the <strong>Baseline</strong> tab (the 5 axes + a 0–10 Slovenia score) and Overall will learn how much each axis actually matters to you — {learned.n}/{learned.need} so far.
    </p>
  );
}

function shortLabel(label) {
  return { "January test": "January" }[label] || label;
}
