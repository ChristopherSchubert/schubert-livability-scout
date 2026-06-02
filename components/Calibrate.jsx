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
 * Calibrate — a sortable ranking TABLE.
 *
 * Columns are the five measured axes (each an absolute 0–10 from the cited
 * metrics) plus an Overall = weighted average. Click any column header to sort
 * by it. The Overall weights are LEARNED from the owner's gut (how well each
 * axis predicts the felt Slovenia score) once ≥6 places are rated; until then
 * the axes count equally and the page says so — never invented.
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner } = usePlanner();
  const [sort, setSort] = useState({ key: "overall", dir: "desc" });
  const [hideCalibration, setHideCalibration] = useState(true);
  const [nowMonth] = useState(() => new Date().getMonth());

  // Calibration places (loved/known references + controls) anchor the gut
  // regression but aren't candidates to visit, so they're hidden by default.
  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const learned = useMemo(() => learnedAxisWeights(planner.cities), [planner.cities]);
  const equalWeights = useMemo(() => Object.fromEntries(calibrateAxes.map(([k]) => [k, 1])), []);
  const weights = learned.weights || equalWeights;

  const rows = useMemo(() => {
    const data = visibleCities.map((cityItem) => {
      const roll = axisRollup(cityItem);
      return {
        cityItem,
        roll,
        overall: weightedAxisScore(cityItem, weights),
        visitNow: visitNowScore(cityItem, nowMonth),
        measured: calibrateAxes.some(([k]) => roll[k] != null),
      };
    });
    const val = (row) => (sort.key === "overall" ? row.overall : sort.key === "visitnow" ? row.visitNow : sort.key === "city" ? row.cityItem.name : row.roll[sort.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    return data.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // unmeasured always last
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [visibleCities, weights, sort, nowMonth]);

  const clickSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "city" ? "asc" : "desc" }));
  const arrow = (key) => (sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <AppShell activeMode="calibrate">
      <section className="canvas-header">
        <div>
          <p className="canvas-eyebrow stage-calibrate-text">Ranking</p>
          <h1>Rank by measured fit</h1>
          <p className="canvas-sub">
            Each column is a measured axis scored 0–10 from the cited metrics. <strong>Overall</strong> is their weighted average. Click any header to sort.
          </p>
        </div>
      </section>

      <WeightNote learned={learned} />

      {calCount > 0 ? (
        <label className="cal-toggle">
          <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
          Hide calibration / reference places ({calCount})
        </label>
      ) : null}

      <section className="rank-table-wrap">
        <table className="rank-table">
          <thead>
            <tr>
              <th className="rt-rank">#</th>
              <th className="rt-city sortable" onClick={() => clickSort("city")}>City{arrow("city")}</th>
              {calibrateAxes.map(([key, label]) => (
                <th key={key} className="rt-axis sortable" onClick={() => clickSort(key)} title={label}>
                  {shortLabel(label)}{arrow(key)}
                  {learned.weights ? <span className="rt-weight">×{(weights[key] ?? 1).toFixed(1)}</span> : null}
                </th>
              ))}
              <th className="rt-overall sortable" onClick={() => clickSort("overall")}>Overall{arrow("overall")}</th>
              <th className="rt-visitnow sortable" onClick={() => clickSort("visitnow")} title="How good this month is to visit, by climate comfort. Not part of the fit score.">
                Visit now<span className="rt-weight">{MONTHS[nowMonth]}</span>{arrow("visitnow")}
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
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

// Heatmap score cell — number tinted red→amber→green by its 0–10 value.
function ScoreCell({ value }) {
  if (value == null) return <span className="rt-na">—</span>;
  const hue = Math.round(value * 12); // 0 red → 120 green
  return <span className="rt-score" style={{ background: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 45% 30%)` }}>{value.toFixed(1)}</span>;
}

// Honest weight state: learned from gut, or equal pending enough ratings.
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
