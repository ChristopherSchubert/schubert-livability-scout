// lib/measurers/_runner.js — orchestrate measurers for one city.
//
// Resolves dependencies, runs each measurer with throttle + per-measurer
// try/catch, merges all patches, and writes a single UPDATE at the end.
//
// Idempotent: by default a measurer is skipped if every output it declares in
// `writes` is already populated on the city. --force re-runs everything.

import { writePatch } from "./_db.js";

function topoOrder(measurers) {
  // Tiny topological sort over `needs`. Currently every measurer needs only
  // lat/lon (provided by the city row, not by other measurers), so order is
  // input order. Kept abstract so a future measurer can depend on, e.g.,
  // terrain's heart_elev_m output.
  const provides = new Map();
  for (const m of measurers) {
    for (const k of (m.writes?.measuredMetrics || [])) provides.set(k, m.id);
    for (const k of (m.writes?.columns || [])) provides.set(k, m.id);
  }
  const visited = new Set(), out = [];
  const visit = (m, stack = []) => {
    if (visited.has(m.id)) return;
    if (stack.includes(m.id)) throw new Error(`measurer cycle: ${stack.concat(m.id).join(" → ")}`);
    for (const need of m.needs || []) {
      const owner = provides.get(need);
      if (owner && owner !== m.id) {
        const dep = measurers.find((x) => x.id === owner);
        if (dep) visit(dep, [...stack, m.id]);
      }
    }
    visited.add(m.id);
    out.push(m);
  };
  for (const m of measurers) visit(m);
  return out;
}

function hasAllOutputs(measurer, city) {
  const mm = city.measured_metrics || {};
  for (const k of (measurer.writes?.measuredMetrics || [])) if (mm[k] == null) return false;
  for (const k of (measurer.writes?.columns || [])) if (city[k] == null) return false;
  return (measurer.writes?.measuredMetrics?.length || measurer.writes?.columns?.length) > 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runForCity(client, city, measurers, { asOf, force = false, dryRun = false }) {
  const order = topoOrder(measurers);
  const results = []; // { id, status: "ok" | "skipped" | "missing-inputs" | "no-output" | "error", note }
  const merged = { measuredMetrics: {}, columns: {} };
  let visitClimate;

  for (const m of order) {
    if (!force && hasAllOutputs(m, city)) {
      results.push({ id: m.id, status: "skipped", note: "already populated (use --force to refresh)" });
      continue;
    }
    const ctx = {
      lat: city.lat, lon: city.lon, name: city.name,
      asOf,
      prior: city.measured_metrics || {},
      // Metrics computed earlier in THIS run, so a later measurer can read
      // what a peer just emitted (e.g., horizon upgrades skyline_deg after
      // skyline ran). Without this, `prior` only reflects the DB state at
      // run start and in-flight writes are invisible.
      current: { ...(city.measured_metrics || {}), ...merged.measuredMetrics },
      env: process.env,
    };
    const missing = (m.needs || []).filter((n) => ctx[n] == null && city[n] == null);
    if (missing.length) {
      results.push({ id: m.id, status: "missing-inputs", note: `needs ${missing.join(", ")}` });
      continue;
    }
    try {
      // Second arg is the full city row for measurers that need more than
      // lat/lon/name (e.g. admin reads name; others may read slug or
      // heart_intersection later). Most measurers ignore it.
      const patch = await m.run(ctx, city);
      if (!patch || (
        !Object.keys(patch.measuredMetrics || {}).length &&
        patch.visitClimate === undefined &&
        !Object.keys(patch.columns || {}).length
      )) {
        results.push({ id: m.id, status: "no-output", note: patch?.notes });
      } else {
        Object.assign(merged.measuredMetrics, patch.measuredMetrics || {});
        Object.assign(merged.columns, patch.columns || {});
        if (patch.visitClimate !== undefined) visitClimate = patch.visitClimate;
        results.push({ id: m.id, status: "ok", note: patch.notes });
      }
    } catch (err) {
      results.push({ id: m.id, status: "error", note: err?.message || String(err) });
    }
    if (m.throttleMs) await sleep(m.throttleMs);
  }

  if (!dryRun) {
    const patch = {};
    if (Object.keys(merged.measuredMetrics).length) patch.measuredMetrics = merged.measuredMetrics;
    if (visitClimate !== undefined) patch.visitClimate = visitClimate;
    if (Object.keys(merged.columns).length) patch.columns = merged.columns;
    if (Object.keys(patch).length) await writePatch(client, city.id, patch, asOf);
  }
  return { results, patch: { ...merged, visitClimate } };
}

export function formatResultRow(city, { results }) {
  const parts = results.map((r) => {
    const sym = r.status === "ok" ? "✓" : r.status === "skipped" ? "·" : r.status === "error" ? "✗" : "?";
    return `${sym} ${r.id}${r.note ? ` (${r.note})` : ""}`;
  });
  return `${city.name.padEnd(36)} ${parts.join("  ")}`;
}
