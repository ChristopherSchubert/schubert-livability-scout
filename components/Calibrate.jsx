"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MONTHS,
  axisRollup,
  calibrateAxes,
  citySlug,
  learnedAxisWeights,
  visitNowScore,
  weightedAxisScore,
} from "../lib/planner-data";
import { chipsFor } from "../lib/chips";
import AppShell from "./AppShell";
import { usePlanner } from "./PlannerProvider";

/**
 * Calibrate — sortable, filterable ranking table.
 *
 * Columns are the five measured axes (each an absolute 0–10 from the cited
 * metrics) plus an Overall = weighted average and a Visit-now (this month's
 * climate comfort, informational only). Sort by clicking any header; SHIFT-
 * click to add a secondary sort. The Overall weights are LEARNED from the
 * owner's gut once ≥6 places are rated; until then the axes count equally.
 *
 * Filters live in a slide-in drawer to keep the toolbar light. The drawer
 * carries: region/state/chip multi-selects (pills), per-axis min and visit-
 * now min sliders (0.5-step with hash marks), and the hide-calibration toggle.
 */
export default function Calibrate() {
  const router = useRouter();
  const { planner } = usePlanner();
  const [sort, setSort] = useState([{ key: "overall", dir: "desc" }]);
  const [hideCalibration, setHideCalibration] = useState(true);
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState(() => new Set());
  const [states, setStates] = useState(() => new Set());
  const [chipFilters, setChipFilters] = useState(() => new Set());
  const [chipMode, setChipMode] = useState("any");
  const [axisMins, setAxisMins] = useState({});
  const [visitNowMin, setVisitNowMin] = useState(0);
  const [nowMonth] = useState(() => new Date().getMonth());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const calCount = planner.cities.filter((c) => c.isCalibration).length;
  const visibleCities = hideCalibration ? planner.cities.filter((c) => !c.isCalibration) : planner.cities;

  const learned = useMemo(() => learnedAxisWeights(planner.cities), [planner.cities]);
  const equalWeights = useMemo(() => Object.fromEntries(calibrateAxes.map(([k]) => [k, 1])), []);
  const weights = learned.weights || equalWeights;

  const cityRows = useMemo(() => visibleCities.map((cityItem) => {
    const roll = axisRollup(cityItem);
    const [state, region] = parseStateRegion(cityItem.name);
    return {
      cityItem,
      roll,
      overall: weightedAxisScore(cityItem, weights),
      visitNow: visitNowScore(cityItem, nowMonth),
      state,
      region,
      chipLabels: chipsFor(cityItem),
    };
  }), [visibleCities, weights, nowMonth]);

  const availableRegions = useMemo(() => {
    const present = new Set(cityRows.map((r) => r.region));
    return REGION_ORDER.filter((r) => present.has(r));
  }, [cityRows]);
  const availableStates = useMemo(() => {
    const s = new Set(cityRows.map((r) => r.state).filter((x) => x && x !== "—"));
    return [...s].sort();
  }, [cityRows]);
  const availableChips = useMemo(() => {
    const counts = new Map();
    for (const row of cityRows) for (const label of row.chipLabels) counts.set(label, (counts.get(label) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [cityRows]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const data = cityRows.filter((row) => {
      if (needle && !row.cityItem.name.toLowerCase().includes(needle)) return false;
      if (regions.size && !regions.has(row.region)) return false;
      if (states.size && !states.has(row.state)) return false;
      if (chipFilters.size) {
        const set = new Set(row.chipLabels);
        if (chipMode === "all") {
          for (const c of chipFilters) if (!set.has(c)) return false;
        } else {
          let any = false;
          for (const c of chipFilters) if (set.has(c)) { any = true; break; }
          if (!any) return false;
        }
      }
      for (const [key] of calibrateAxes) {
        const min = axisMins[key];
        if (min != null && min > 0 && (row.roll[key] == null || row.roll[key] < min)) return false;
      }
      if (visitNowMin > 0 && (row.visitNow == null || row.visitNow < visitNowMin)) return false;
      return true;
    });

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
  }, [cityRows, sort, query, regions, states, chipFilters, chipMode, axisMins, visitNowMin]);

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

  const axisMinActive = Object.values(axisMins).filter((v) => v > 0).length;
  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    regions.size + states.size + chipFilters.size +
    axisMinActive +
    (visitNowMin > 0 ? 1 : 0);

  const clearFilters = () => {
    setQuery("");
    setRegions(new Set());
    setStates(new Set());
    setChipFilters(new Set());
    setAxisMins({});
    setVisitNowMin(0);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <AppShell activeMode="calibrate">
      <section className="canvas-header">
        <div>
          <p className="page-eyebrow">Ranking</p>
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
        <button
          type="button"
          className={`rank-filters-btn${activeFilterCount > 0 ? " has-active" : ""}`}
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
        >
          Filters
          {activeFilterCount > 0 ? <span className="rank-filters-count">{activeFilterCount}</span> : null}
        </button>
        {activeFilterCount > 0 ? (
          <button type="button" className="rank-clear" onClick={clearFilters}>Clear</button>
        ) : null}
        <ActiveFilterSummary
          query={query} setQuery={setQuery}
          regions={regions} setRegions={setRegions}
          states={states} setStates={setStates}
          chipFilters={chipFilters} setChipFilters={setChipFilters}
          axisMins={axisMins} setAxisMins={setAxisMins}
          visitNowMin={visitNowMin} setVisitNowMin={setVisitNowMin}
          nowMonth={nowMonth}
        />
        <span className="rank-controls-spacer" />
        {calCount > 0 ? (
          <label className="rank-toggle">
            <input type="checkbox" checked={hideCalibration} onChange={(e) => setHideCalibration(e.target.checked)} />
            Hide calibration ({calCount})
          </label>
        ) : null}
      </section>

      <section className="rank-table-wrap">
        <div className="rank-count">{rows.length} of {cityRows.length} candidates{activeFilterCount > 0 ? " match filters" : ""}</div>
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

      {drawerOpen ? (
        <FilterDrawer
          onClose={() => setDrawerOpen(false)}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
          regions={regions} setRegions={setRegions} availableRegions={availableRegions}
          states={states} setStates={setStates} availableStates={availableStates}
          chipFilters={chipFilters} setChipFilters={setChipFilters} availableChips={availableChips}
          chipMode={chipMode} setChipMode={setChipMode}
          axisMins={axisMins} setAxisMins={setAxisMins}
          visitNowMin={visitNowMin} setVisitNowMin={setVisitNowMin}
          nowMonth={nowMonth}
        />
      ) : null}
    </AppShell>
  );
}

function FilterDrawer({
  onClose, onClear, activeFilterCount,
  regions, setRegions, availableRegions,
  states, setStates, availableStates,
  chipFilters, setChipFilters, availableChips,
  chipMode, setChipMode,
  axisMins, setAxisMins,
  visitNowMin, setVisitNowMin,
  nowMonth,
}) {
  const toggleSetItem = (setter) => (value) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });
  const toggleRegion = toggleSetItem(setRegions);
  const toggleState = toggleSetItem(setStates);
  const toggleChip = toggleSetItem(setChipFilters);

  return (
    <div className="filter-drawer-overlay" onClick={onClose}>
      <aside className="filter-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filters">
        <header className="filter-drawer-head">
          <h2>Filters</h2>
          <div className="filter-drawer-head-actions">
            {activeFilterCount > 0 ? (
              <button type="button" className="filter-drawer-clear" onClick={onClear}>Clear all</button>
            ) : null}
            <button type="button" className="filter-drawer-close" onClick={onClose} aria-label="Close filters">×</button>
          </div>
        </header>

        <div className="filter-drawer-body">
          {availableRegions.length > 0 ? (
            <FilterSection title="Region" count={regions.size}>
              <div className="filter-pill-row">
                {availableRegions.map((r) => (
                  <PillToggle key={r} label={r} selected={regions.has(r)} onClick={() => toggleRegion(r)} />
                ))}
              </div>
            </FilterSection>
          ) : null}

          {availableStates.length > 0 ? (
            <FilterSection title="State" count={states.size}>
              <div className="filter-pill-row">
                {availableStates.map((s) => (
                  <PillToggle key={s} label={s} selected={states.has(s)} onClick={() => toggleState(s)} />
                ))}
              </div>
            </FilterSection>
          ) : null}

          {availableChips.length > 0 ? (
            <FilterSection
              title="Chips"
              count={chipFilters.size}
              aside={
                chipFilters.size > 1 ? (
                  <div className="filter-mode">
                    <button type="button" className={chipMode === "any" ? "on" : ""} onClick={() => setChipMode("any")}>Any</button>
                    <button type="button" className={chipMode === "all" ? "on" : ""} onClick={() => setChipMode("all")}>All</button>
                  </div>
                ) : null
              }
            >
              <div className="filter-pill-row">
                {availableChips.map(([label, n]) => (
                  <PillToggle
                    key={label}
                    label={label}
                    badge={n}
                    selected={chipFilters.has(label)}
                    onClick={() => toggleChip(label)}
                  />
                ))}
              </div>
            </FilterSection>
          ) : null}

          <FilterSection title="Minimum scores" count={Object.values(axisMins).filter((v) => v > 0).length + (visitNowMin > 0 ? 1 : 0)}>
            <div className="hash-slider-stack">
              {calibrateAxes.map(([key, label]) => (
                <HashSlider
                  key={key}
                  label={shortLabel(label)}
                  value={axisMins[key] ?? 0}
                  onChange={(v) => setAxisMins((m) => ({ ...m, [key]: v }))}
                />
              ))}
              <HashSlider
                label={`Visit now (${MONTHS[nowMonth]})`}
                value={visitNowMin}
                onChange={setVisitNowMin}
              />
            </div>
          </FilterSection>
        </div>

        <footer className="filter-drawer-foot">
          <button type="button" className="filter-drawer-done" onClick={onClose}>Done</button>
        </footer>
      </aside>
    </div>
  );
}

function FilterSection({ title, count, aside, children }) {
  return (
    <section className="filter-section">
      <header className="filter-section-head">
        <h3>{title}{count > 0 ? <span className="filter-section-count">{count}</span> : null}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function PillToggle({ label, badge, selected, onClick }) {
  return (
    <button type="button" className={`filter-pill${selected ? " selected" : ""}`} onClick={onClick} aria-pressed={selected}>
      <span>{label}</span>
      {badge != null ? <span className="filter-pill-badge">{badge}</span> : null}
    </button>
  );
}

function HashSlider({ label, value, onChange }) {
  const active = value > 0;
  return (
    <div className={`hash-slider${active ? " active" : ""}`}>
      <div className="hash-slider-head">
        <span className="hash-slider-label">{label}</span>
        <span className="hash-slider-value">{active ? `≥ ${value.toFixed(1)}` : "any"}</span>
      </div>
      <div className="hash-slider-track">
        <div className="hash-slider-ticks" aria-hidden="true">
          {TICK_VALUES.map((t) => (
            <span
              key={t}
              className={[
                "hash-slider-tick",
                t % 1 === 0 ? "major" : "minor",
                active && t <= value ? "on" : "",
              ].filter(Boolean).join(" ")}
            />
          ))}
        </div>
        <input
          type="range" min={0} max={10} step={0.5}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="hash-slider-input"
          aria-label={`Minimum ${label} score`}
        />
      </div>
      <div className="hash-slider-scale" aria-hidden="true">
        <span>0</span><span>5</span><span>10</span>
      </div>
    </div>
  );
}

function ActiveFilterSummary({
  query, setQuery,
  regions, setRegions,
  states, setStates,
  chipFilters, setChipFilters,
  axisMins, setAxisMins,
  visitNowMin, setVisitNowMin,
  nowMonth,
}) {
  const chips = [];
  if (query.trim()) chips.push({ key: `q:${query}`, label: `"${query}"`, onRemove: () => setQuery("") });
  for (const r of regions) chips.push({ key: `r:${r}`, label: r, onRemove: () => setRegions((p) => { const n = new Set(p); n.delete(r); return n; }) });
  for (const s of states) chips.push({ key: `s:${s}`, label: s, onRemove: () => setStates((p) => { const n = new Set(p); n.delete(s); return n; }) });
  for (const c of chipFilters) chips.push({ key: `c:${c}`, label: c, onRemove: () => setChipFilters((p) => { const n = new Set(p); n.delete(c); return n; }) });
  for (const [key, label] of calibrateAxes) {
    const v = axisMins[key];
    if (v > 0) chips.push({ key: `m:${key}`, label: `${shortLabel(label)} ≥ ${v.toFixed(1)}`, onRemove: () => setAxisMins((m) => ({ ...m, [key]: 0 })) });
  }
  if (visitNowMin > 0) chips.push({ key: "vn", label: `${MONTHS[nowMonth]} ≥ ${visitNowMin.toFixed(1)}`, onRemove: () => setVisitNowMin(0) });
  if (!chips.length) return null;
  return (
    <div className="rank-active-chips">
      {chips.map((c) => (
        <button key={c.key} type="button" className="rank-active-chip" onClick={c.onRemove} title="Remove filter">
          <span>{c.label}</span><span className="rank-active-chip-x">×</span>
        </button>
      ))}
    </div>
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

const STATE_TO_REGION = {
  ME: "Northeast", NH: "Northeast", VT: "Northeast", MA: "Northeast", RI: "Northeast", CT: "Northeast", NY: "Northeast", NJ: "Northeast", PA: "Northeast",
  OH: "Midwest", MI: "Midwest", IN: "Midwest", IL: "Midwest", WI: "Midwest", MN: "Midwest", IA: "Midwest", MO: "Midwest", ND: "Midwest", SD: "Midwest", NE: "Midwest", KS: "Midwest",
  DE: "South", MD: "South", DC: "South", VA: "South", WV: "South", KY: "South", NC: "South", SC: "South", GA: "South", FL: "South", AL: "South", MS: "South", TN: "South", AR: "South", LA: "South", OK: "South", TX: "South",
  MT: "Mountain", ID: "Mountain", WY: "Mountain", CO: "Mountain", NM: "Mountain", UT: "Mountain", AZ: "Mountain", NV: "Mountain",
  WA: "Pacific", OR: "Pacific", CA: "Pacific", AK: "Pacific", HI: "Pacific",
};
const REGION_ORDER = ["Northeast", "South", "Midwest", "Mountain", "Pacific", "International", "Other"];

function parseStateRegion(name) {
  const m = /,\s*([A-Z]{2})\s*$/.exec(name || "");
  if (!m) return ["—", "International"];
  const state = m[1];
  return [state, STATE_TO_REGION[state] || "Other"];
}

const TICK_VALUES = Array.from({ length: 21 }, (_, i) => i * 0.5);
