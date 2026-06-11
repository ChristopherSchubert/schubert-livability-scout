// Critical-path E2E (issue #44): compose → block → solve → book. Needs a seeded
// auth session (dev-login) + a live Supabase, so it runs on CI/Mac, not the
// sandbox. Written now so the path is captured; fill the dev-login step in when
// wired (CLAUDE.md auth-bypass: POST /api/dev-login → setSession).
import { test, expect } from "@playwright/test";

test.describe("Trip planner critical path", () => {
  test.skip(!process.env.E2E_SUPABASE, "needs a live Supabase + dev-login session");

  test("compose a trip, add an entry, see it in Book", async ({ page }) => {
    await page.goto("/trips");
    await page.getByRole("button", { name: /New trip/ }).click();
    await page.getByPlaceholder(/Slovenia/).fill("E2E Trip");
    // start/end date inputs + create…
    await page.getByRole("button", { name: /Create trip/ }).click();
    await expect(page.getByText("E2E Trip")).toBeVisible();
    // open it, add an entry via the editor, mark status booked, assert it
    // appears in the BookPanel reservation ledger…
  });
});
