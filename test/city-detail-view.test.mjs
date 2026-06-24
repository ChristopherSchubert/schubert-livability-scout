// Guards the legacy-fold in axesSnapshot: a superseded raw-count metric
// (cafe_n → cafe_score) rides INTO the weighted row as a `legacy` sub-stat
// instead of taking its own row — but only when the superseding metric is
// actually measured. Otherwise the raw count still shows standalone (no data
// lost on a city not yet re-measured). User-facing reason: the By-the-numbers
// chapter was spending two full rows per POI type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { axesSnapshot, buildHomebaseView } from "../lib/city-detail-view.js";

const dp = (value) => ({ value, asOf: "2026-06-13", source: "test" });

function aliveness(metrics) {
  const axis = axesSnapshot({ measuredMetrics: metrics }).find((a) => a.axis === "aliveness");
  return axis.metrics;
}

test("weighted present → legacy raw count folds into the weighted row, no standalone row", () => {
  const rows = aliveness({ cafe_score: dp(14.7), cafe_n: dp(8) });
  const cafeScore = rows.find((m) => m.key === "cafe_score");
  const cafeN = rows.find((m) => m.key === "cafe_n");
  assert.equal(cafeN, undefined, "superseded cafe_n should not render its own row");
  assert.ok(cafeScore.legacy, "cafe_score should carry the folded legacy stat");
  assert.equal(cafeScore.legacy.value, 8);
  assert.equal(cafeScore.legacy.key, "cafe_n");
});

test("weighted missing → the legacy raw count keeps its own row (nothing lost)", () => {
  const rows = aliveness({ cafe_n: dp(8) }); // never re-measured with the weighted core
  const cafeScore = rows.find((m) => m.key === "cafe_score");
  const cafeN = rows.find((m) => m.key === "cafe_n");
  assert.ok(cafeN, "cafe_n must still render when cafe_score is absent");
  assert.equal(cafeN.value, 8);
  assert.ok(!cafeScore?.legacy, "no fold when there's nothing to fold into");
});

test("no legacy partner present → weighted row has no legacy sub-stat", () => {
  const rows = aliveness({ cafe_score: dp(14.7) });
  const cafeScore = rows.find((m) => m.key === "cafe_score");
  assert.ok(cafeScore);
  assert.equal(cafeScore.legacy, undefined);
});

// ── buildHomebaseView: the Allison-Park reference contract for Chapter IV (#84,
// baseline-comparison feature). Locks the never-invent rule: missing measurements
// at home must NOT surface as fake zeros in the comparison map; the key is just
// absent so MetricRow renders no reference line.
test("buildHomebaseView: returns null when no homebase city is supplied", () => {
  assert.equal(buildHomebaseView(null), null);
  assert.equal(buildHomebaseView(undefined), null);
});

test("buildHomebaseView: exposes a metrics map keyed by metric key", () => {
  const home = { name: "Allison Park, PA", measuredMetrics: { cafe_score: dp(0.8), walk_score: dp(28) } };
  const hb = buildHomebaseView(home, { slug: "allison-park-pa" });
  assert.equal(hb.name, "Allison Park, PA");
  assert.equal(hb.slug, "allison-park-pa");
  assert.ok(hb.metrics, "metrics map must be present");
  assert.equal(hb.metrics.cafe_score.value, 0.8);
  assert.equal(hb.metrics.walk_score.value, 28);
});

test("buildHomebaseView: unmeasured metrics produce no fake zeros (honest blanks)", () => {
  const home = { name: "Allison Park, PA", measuredMetrics: { cafe_score: dp(0.8) } };
  const hb = buildHomebaseView(home);
  // cafe_score is measured at home — present with the real value
  assert.equal(hb.metrics.cafe_score.value, 0.8);
  // bar_score, rest_score, walk_score etc. were NOT measured → no fabricated 0
  assert.equal(hb.metrics.bar_score?.value ?? null, null);
  assert.equal(hb.metrics.walk_score?.value ?? null, null);
  // The keys may exist (snapshot shape) but the value must be null, never 0
  for (const m of Object.values(hb.metrics)) {
    if (m.key !== "cafe_score") {
      assert.notEqual(m.value, 0, `${m.key} must not surface as a fake 0`);
    }
  }
});

test("buildHomebaseView: carries climate window alongside the metrics map", () => {
  const home = {
    name: "Allison Park, PA",
    visitClimate: Array.from({ length: 12 }, (_, i) => ({ hi: 30 + i * 5, lo: 20 + i * 4, precipDays: 8, daylightHr: 10 })),
    measuredMetrics: {},
  };
  const hb = buildHomebaseView(home);
  assert.equal(hb.visitClimate.length, 12, "climate window passed through");
  assert.ok(hb.extremes, "climate extremes computed for Chapter V deltas");
  assert.ok(hb.metrics, "metrics map present even when measurements are empty");
});
