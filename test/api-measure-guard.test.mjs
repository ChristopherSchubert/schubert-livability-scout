// #55 — measurement is local-only (CLAUDE.md "Production never measures").
// POST /api/measure refuses (404) when measurementAllowed() is false, before it
// can fetch keyed external layers or merge partial, mixed-source metrics over
// the real measured values. (The route itself can't be imported under node:test
// — it pulls `next/server` — so we test the policy the route delegates to.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { measurementAllowed } from "../lib/measurement-guard.js";

test("measurementAllowed: false in production, true everywhere else", () => {
  assert.equal(measurementAllowed("production"), false);
  assert.equal(measurementAllowed("development"), true);
  assert.equal(measurementAllowed("test"), true);
  assert.equal(measurementAllowed(undefined), true); // local dev with no NODE_ENV set
});
