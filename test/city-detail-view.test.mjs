// Guards the legacy-fold in axesSnapshot: a superseded raw-count metric
// (cafe_n → cafe_score) rides INTO the weighted row as a `legacy` sub-stat
// instead of taking its own row — but only when the superseding metric is
// actually measured. Otherwise the raw count still shows standalone (no data
// lost on a city not yet re-measured). User-facing reason: the By-the-numbers
// chapter was spending two full rows per POI type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { axesSnapshot } from "../lib/city-detail-view.js";

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
