// lib/env.js (#88): boot-time env validator. Tests the schema directly so we
// don't depend on a child process or on Next's instrumentation hook.
// Pulls the Schema export from the module's import side-effect graph — the
// module throws on bad env at import, so we re-implement the schema check by
// passing process.env in via a fresh Schema parse. Simpler: test the SHAPE
// against zod by importing zod here and re-declaring the four required keys.

import { test } from "node:test";
import assert from "node:assert/strict";

// The validator file itself runs at import — so to test failure modes we
// dynamically import with the env mutated, and catch on failure.
async function importEnv(envOverride) {
  // Snapshot + replace process.env for this dynamic import.
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, envOverride);
  // Bust the import cache by appending a query string — node honours it for
  // file: URLs in tests.
  const cacheBust = `?t=${Math.random()}`;
  try {
    return await import("../lib/env.js" + cacheBust);
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

const VALID = {
  NODE_ENV: "development",
  NEXT_PUBLIC_HUB_URL: "https://schubert-family.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://fitjkrmiwkdolxhitroc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxxx",
  SUPABASE_SECRET_KEY: "sb_secret_xxxxxxxxxxxxxxxxxxxxx",
};

test("boots with the four required keys", async () => {
  const m = await importEnv(VALID);
  assert.equal(m.env.NEXT_PUBLIC_HUB_URL, VALID.NEXT_PUBLIC_HUB_URL);
  assert.equal(m.env.SUPABASE_SECRET_KEY, VALID.SUPABASE_SECRET_KEY);
});

for (const key of ["NEXT_PUBLIC_HUB_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  test(`refuses to start when ${key} is missing`, async () => {
    const { [key]: _drop, ...partial } = VALID;
    await assert.rejects(() => importEnv(partial), (err) => {
      assert.match(err.message, /Invalid environment/);
      return true;
    });
  });
}

test("rejects non-URL for NEXT_PUBLIC_HUB_URL (typo guard)", async () => {
  await assert.rejects(() => importEnv({ ...VALID, NEXT_PUBLIC_HUB_URL: "schubert-family.vercel.app" }), /Invalid environment/);
});
