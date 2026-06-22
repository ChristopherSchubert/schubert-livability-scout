"use client";

// Shared city-filter system used by Calibrate (ranking table) and FunnelBoard
// (kanban). Both pages filter the same underlying cityItems by the same
// dimensions (region, state, chip vocabulary, per-axis minimums, visit-now
// minimum), so the state, the drawer UI, and the active-chip strip live here.

import { useCallback, useEffect, useState } from "react";
import { MONTHS, axisRollup, calibrateAxes, visitNowScore } from "../lib/planner-data";
import { allChipsFor } from "../lib/chips";

const STATE_TO_REGION = {
  ME: "Northeast", NH: "Northeast", VT: "Northeast", MA: "Northeast", RI: "Northeast", CT: "Northeast", NY: "Northeast", NJ: "Northeast", PA: "Northeast",
  OH: "Midwest", MI: "Midwest", IN: "Midwest", IL: "Midwest", WI: "Midwest", MN: "Midwest", IA: "Midwest", MO: "Midwest", ND: "Midwest", SD: "Midwest", NE: "Midwest", KS: "Midwest",
  DE: "South", MD: "South", DC: "South", VA: "South", WV: "South", KY: "South", NC: "South", SC: "South", GA: "South", FL: "South", AL: "South", MS: "South", TN: "South", AR: "South", LA: "South", OK: "South", TX: "South",
  MT: "Mountain", ID: "Mountain", WY: "Mountain", CO: "Mountain", NM: "Mountain", UT: "Mountain", AZ: "Mountain", NV: "Mountain",
  WA: "Pacific", OR: "Pacific", CA: "Pacific", AK: "Pacific", HI: "Pacific",
};
const REGION_ORDER = ["Northeast", "South", "Midwest", "Mountain", "Pacific", "International", "Other"];
const TICK_VALUES = Array.from({ length: 21 }, (_, i) => i * 0.5);

export function parseStateRegion(name) {
  const m = /,\s*([A-Z]{2})\s*$/.exec(name || "");
  if (!m) return ["—", "International"];
  const state = m[1];
  return [state, STATE_TO_REGION[state] || "Other"];
}

// Minimum shape filters need. Callers extend with overall/visitNow.
export function augmentCityForFilters(cityItem) {
  const [state, region] = parseStateRegion(cityItem.name);
  return {
    cityItem,
    state,
    region,
    chipLabels: allChipsFor(cityItem),
    roll: axisRollup(cityItem),
  };
}

export function availableFilterOptions(cityRows) {
  const presentRegions = new Set(cityRows.map((r) => r.region));
  const availableRegions = REGION_ORDER.filter((r) => presentRegions.has(r));
  const stateSet = new Set(cityRows.map((r) => r.state).filter((x) => x && x !== "—"));
  const availableStates = [...stateSet].sort();
  const counts = new Map();
  for (const row of cityRows) for (const label of (row.chipLabels || [])) counts.set(label, (counts.get(label) || 0) + 1);
  const availableChips = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { availableRegions, availableStates, availableChips };
}

export function applyCityFilters(rows, filters) {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (needle && !row.cityItem.name.toLowerCase().includes(needle)) return false;
    if (filters.regions.size && !filters.regions.has(row.region)) return false;
    if (filters.states.size && !filters.states.has(row.state)) return false;
    if (filters.chipFilters.size) {
      const set = new Set(row.chipLabels || []);
      if (filters.chipMode === "all") {
        for (const c of filters.chipFilters) if (!set.has(c)) return false;
      } else {
        let any = false;
        for (const c of filters.chipFilters) if (set.has(c)) { any = true; break; }
        if (!any) return false;
      }
    }
    if (row.roll) {
      for (const [key] of calibrateAxes) {
        const min = filters.axisMins[key];
        if (min != null && min > 0 && (row.roll[key] == null || row.roll[key] < min)) return false;
      }
    }
    if (filters.visitNowMin > 0 && (row.visitNow == null || row.visitNow < filters.visitNowMin)) return false;
    return true;
  });
}

export function useCityFilters() {
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState(() => new Set());
  const [states, setStates] = useState(() => new Set());
  const [chipFilters, setChipFilters] = useState(() => new Set());
  const [chipMode, setChipMode] = useState("any");
  const [axisMins, setAxisMins] = useState({});
  const [visitNowMin, setVisitNowMin] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nowMonth, setNowMonth] = useState(() => new Date().getMonth());

  const axisMinActive = Object.values(axisMins).filter((v) => v > 0).length;
  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    regions.size + states.size + chipFilters.size +
    axisMinActive +
    (visitNowMin > 0 ? 1 : 0);

  const clearFilters = useCallback(() => {
    setQuery(""); setRegions(new Set()); setStates(new Set());
    setChipFilters(new Set()); setAxisMins({}); setVisitNowMin(0);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return {
    query, setQuery,
    regions, setRegions,
    states, setStates,
    chipFilters, setChipFilters,
    chipMode, setChipMode,
    axisMins, setAxisMins,
    visitNowMin, setVisitNowMin,
    drawerOpen, setDrawerOpen,
    activeFilterCount, clearFilters,
    nowMonth, setNowMonth,
  };
}

export function visitNowFor(cityItem, nowMonth) {
  return visitNowScore(cityItem, nowMonth);
}

export function shortAxisLabel(label) {
  return { "January test": "January" }[label] || label;
}

// ── UI ────────────────────────────────────────────────────────────────────

// Shared sort dropdown for card/list views (the planner backlog today; any
// future list can reuse it). Filtering and sorting are different interaction
// models — the Ranking table sorts by clicking column headers — so sort lives
// as its own opt-in primitive rather than inside the filter drawer. `options`
// is `[{ id, label }]`; the caller maps `id` → a comparator value itself.
export function SortControl({ value, onChange, options, label = "Sort" }) {
  return (
    <label className="rank-sort">
      <span className="rank-sort-label">{label}</span>
      <select className="rank-sort-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function CityFiltersBar({ filters }) {
  return (
    <>
      <button
        type="button"
        className={`rank-filters-btn${filters.activeFilterCount > 0 ? " has-active" : ""}`}
        onClick={() => filters.setDrawerOpen(true)}
        aria-expanded={filters.drawerOpen}
      >
        Filters
        {filters.activeFilterCount > 0 ? <span className="rank-filters-count">{filters.activeFilterCount}</span> : null}
      </button>
      {filters.activeFilterCount > 0 ? (
        <button type="button" className="rank-clear" onClick={filters.clearFilters}>Clear</button>
      ) : null}
      <ActiveFilterChips filters={filters} />
    </>
  );
}

function ActiveFilterChips({ filters }) {
  const chips = [];
  if (filters.query.trim()) chips.push({ key: `q:${filters.query}`, label: `"${filters.query}"`, onRemove: () => filters.setQuery("") });
  for (const r of filters.regions) chips.push({ key: `r:${r}`, label: r, onRemove: () => filters.setRegions((p) => { const n = new Set(p); n.delete(r); return n; }) });
  for (const s of filters.states) chips.push({ key: `s:${s}`, label: s, onRemove: () => filters.setStates((p) => { const n = new Set(p); n.delete(s); return n; }) });
  for (const c of filters.chipFilters) chips.push({ key: `c:${c}`, label: c, onRemove: () => filters.setChipFilters((p) => { const n = new Set(p); n.delete(c); return n; }) });
  for (const [key, label] of calibrateAxes) {
    const v = filters.axisMins[key];
    if (v > 0) chips.push({ key: `m:${key}`, label: `${shortAxisLabel(label)} ≥ ${v.toFixed(1)}`, onRemove: () => filters.setAxisMins((m) => ({ ...m, [key]: 0 })) });
  }
  if (filters.visitNowMin > 0) chips.push({ key: "vn", label: `${MONTHS[filters.nowMonth]} ≥ ${filters.visitNowMin.toFixed(1)}`, onRemove: () => filters.setVisitNowMin(0) });
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

export function CityFilterDrawer({ filters, options }) {
  if (!filters.drawerOpen) return null;
  const toggleSetItem = (setter) => (value) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });
  const toggleRegion = toggleSetItem(filters.setRegions);
  const toggleState = toggleSetItem(filters.setStates);
  const toggleChip = toggleSetItem(filters.setChipFilters);

  return (
    <div className="filter-drawer-overlay" onClick={() => filters.setDrawerOpen(false)}>
      <aside className="filter-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filters">
        <header className="filter-drawer-head">
          <h2>Filters</h2>
          <div className="filter-drawer-head-actions">
            {filters.activeFilterCount > 0 ? (
              <button type="button" className="filter-drawer-clear" onClick={filters.clearFilters}>Clear all</button>
            ) : null}
            <button type="button" className="filter-drawer-close" onClick={() => filters.setDrawerOpen(false)} aria-label="Close filters">×</button>
          </div>
        </header>

        <div className="filter-drawer-body">
          {options.availableRegions.length > 0 ? (
            <FilterSection title="Region" count={filters.regions.size}>
              <div className="filter-pill-row">
                {options.availableRegions.map((r) => (
                  <PillToggle key={r} label={r} selected={filters.regions.has(r)} onClick={() => toggleRegion(r)} />
                ))}
              </div>
            </FilterSection>
          ) : null}

          {options.availableStates.length > 0 ? (
            <FilterSection title="State" count={filters.states.size}>
              <div className="filter-pill-row">
                {options.availableStates.map((s) => (
                  <PillToggle key={s} label={s} selected={filters.states.has(s)} onClick={() => toggleState(s)} />
                ))}
              </div>
            </FilterSection>
          ) : null}

          {options.availableChips.length > 0 ? (
            <FilterSection
              title="Chips"
              count={filters.chipFilters.size}
              aside={
                filters.chipFilters.size > 1 ? (
                  <div className="filter-mode">
                    <button type="button" className={filters.chipMode === "any" ? "on" : ""} onClick={() => filters.setChipMode("any")}>Any</button>
                    <button type="button" className={filters.chipMode === "all" ? "on" : ""} onClick={() => filters.setChipMode("all")}>All</button>
                  </div>
                ) : null
              }
            >
              <div className="filter-pill-row">
                {options.availableChips.map(([label, n]) => (
                  <PillToggle
                    key={label}
                    label={label}
                    badge={n}
                    selected={filters.chipFilters.has(label)}
                    onClick={() => toggleChip(label)}
                  />
                ))}
              </div>
            </FilterSection>
          ) : null}

          <FilterSection
            title="Minimum scores"
            count={Object.values(filters.axisMins).filter((v) => v > 0).length + (filters.visitNowMin > 0 ? 1 : 0)}
          >
            <div className="hash-slider-stack">
              {calibrateAxes.map(([key, label]) => (
                <HashSlider
                  key={key}
                  label={shortAxisLabel(label)}
                  value={filters.axisMins[key] ?? 0}
                  onChange={(v) => filters.setAxisMins((m) => ({ ...m, [key]: v }))}
                />
              ))}
              <HashSlider
                label={`Visit now (${MONTHS[filters.nowMonth]})`}
                value={filters.visitNowMin}
                onChange={filters.setVisitNowMin}
              />
            </div>
          </FilterSection>
        </div>

        <footer className="filter-drawer-foot">
          <button type="button" className="filter-drawer-done" onClick={() => filters.setDrawerOpen(false)}>Done</button>
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
