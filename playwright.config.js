// Playwright E2E config (issue #44). The critical path: compose → solve → book.
// NOT runnable in the dev sandbox — the Playwright browser CDN is not in the
// network allowlist (403 Host not in allowlist). Runs on CI (#45) / the Mac,
// where `npx playwright install chromium` succeeds. Enable by:
//   npm i -D @playwright/test && npx playwright install chromium && npm run e2e
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"] },
});
