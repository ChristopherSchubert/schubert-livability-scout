const fs = require("node:fs");
const path = require("node:path");
const { defineConfig, devices } = require("@playwright/test");

// Surface the Supabase URL + publishable key to the spec (for the owner-scoped
// REST delete that cleans up the trip the test creates). Read straight from
// .env.local — the same file the dev server uses; no extra dependency.
try {
  const env = fs.readFileSync(path.join(__dirname, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch { /* No .env.local (e.g. CI) — the spec's teardown then fails loudly rather than leaking (#86). */ }

// E2E critical-path tests (#44). Runs against the dev server (reused if already
// up). The spec creates a NEW trip — owned by the dev-login user — so writes
// pass RLS (the seeded Slovenia trip is owned by someone else and is read-only
// to the dev user). Run: npm run test:e2e.
module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    // This project's claimed port block is 38520–38539 (never 3000; see CLAUDE.md).
    baseURL: "http://localhost:38520",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 38520",
    url: "http://localhost:38520",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
