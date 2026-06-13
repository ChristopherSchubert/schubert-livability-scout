// Guards the "zero is not null" rule (#53, CLAUDE.md Corollary 2): a degraded
// Overpass response (200 OK + a `remark` signalling timeout/OOM/killed) must be
// treated as a FAILURE, never computed into fabricated-zero metrics. Every
// Overpass-backed measurer (osm-context, lib/measure osmMetrics) routes its
// reject decision through overpassRemarkFailed().
import { test } from "node:test";
import assert from "node:assert/strict";
import { overpassRemarkFailed } from "../lib/measure.js";

test("overpassRemarkFailed: rejects every degraded-remark shape", () => {
  const bad = [
    "runtime error: Query timed out",
    "Query ran out of memory",
    "the query has been killed",
    "runtime error: query exceeded the time limit",
    "Query timed out in 'recurse' at line 3",
    "An internal error occurred: out of memory",
    "empty result (timeout)",
  ];
  for (const remark of bad) {
    assert.equal(overpassRemarkFailed({ remark, elements: [] }), true, `should reject: ${remark}`);
  }
});

test("overpassRemarkFailed: passes a clean response (no false positives)", () => {
  assert.equal(overpassRemarkFailed({ elements: [{ type: "node", tags: { amenity: "cafe" } }] }), false);
  assert.equal(overpassRemarkFailed({ elements: [] }), false);          // legitimately-empty area, no remark
  assert.equal(overpassRemarkFailed({ remark: "" }), false);
  assert.equal(overpassRemarkFailed(null), false);
  assert.equal(overpassRemarkFailed(undefined), false);
});

test("the degraded '{ remark, elements:[] }' case the issue cites is caught", () => {
  // This exact shape (200 OK, runtime error, empty body) is what produced
  // cafe_n=0/forest_frac=0 for Bled/Ljubljana/Piran on 2026-06-04. The measurer
  // returns notes (no measuredMetrics) instead of persisting zeros.
  assert.equal(overpassRemarkFailed({ remark: "runtime error", elements: [] }), true);
});
