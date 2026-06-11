// Characterization tests for the measured-scoring core (#42, guarding the
// #47 godfile split). Run: `node --test`. Zero deps (node:test + node:assert).
// These pin current behaviour so the metrics extraction can be proven to
// change nothing. They assert the public API from lib/planner-data.js — the
// barrel — so they keep passing wherever the code physically lives.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultWeights,
  metricScore,
  metricTaxonomy,
  metricByKey,
  emptyMeasured,
  axisRollup,
  weightedAxisScore,
  learnedAxisWeights,
  LEARN_MIN_SAMPLES,
  calibrateAxes,
  cityStage,
  starterCities,
} from "../lib/planner-data.js";

test("defaultWeights: 1 per measured axis", () => {
  assert.deepEqual(defaultWeights(), {
    setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1,
  });
});

test("calibrateAxes: the five measured axes, in order", () => {
  assert.deepEqual(calibrateAxes.map(([k]) => k), [
    "setting", "aliveness", "fabric", "realness", "january",
  ]);
  assert.equal(LEARN_MIN_SAMPLES, 6);
});

test("emptyMeasured: every taxonomy key present and null", () => {
  const em = emptyMeasured();
  const keys = metricTaxonomy.flatMap((g) => g.metrics.map((m) => m.key));
  assert.equal(Object.keys(em).length, keys.length);
  for (const k of keys) assert.equal(em[k], null, `${k} should seed null`);
});

test("metricScore: pinned value + total coverage of the taxonomy", () => {
  // pinned: a known band evaluation must not drift
  assert.equal(metricScore(5, "skyline_deg"), 5.294117647058823);
  // unknown key is null, never a throw or a guess
  assert.equal(metricScore(5, "not_a_real_metric"), null);
  // every real metric scores to a number in [0,10] (or null) — no band gaps
  for (const key of Object.keys(metricByKey)) {
    const s = metricScore(5, key);
    if (s !== null) {
      assert.ok(Number.isFinite(s) && s >= 0 && s <= 10, `${key} → ${s} out of range`);
    }
  }
});

test("axisRollup + weightedAxisScore: null when nothing is measured", () => {
  const blank = { measuredMetrics: emptyMeasured() };
  assert.deepEqual(axisRollup(blank), {
    setting: null, aliveness: null, fabric: null, realness: null, january: null,
  });
  assert.equal(weightedAxisScore(blank, defaultWeights()), null);
});

test("axisRollup: finite per-axis score once an axis is fully measured", () => {
  // measure every metric on the first axis; that axis should roll up finite
  const axis0 = metricTaxonomy[0];
  const mm = emptyMeasured();
  for (const m of axis0.metrics) mm[m.key] = { value: 5, asOf: "2026-01-01" };
  const roll = axisRollup({ measuredMetrics: mm });
  assert.ok(Number.isFinite(roll[axis0.axis]), `${axis0.axis} should be finite`);
});

test("learnedAxisWeights: refuses to learn below the sample floor", () => {
  assert.deepEqual(learnedAxisWeights([]), { weights: null, n: 0, need: LEARN_MIN_SAMPLES });
});

test("cityStage: a seeded starter city lands in 'planning'", () => {
  assert.equal(cityStage(starterCities[0]), "planning");
});
