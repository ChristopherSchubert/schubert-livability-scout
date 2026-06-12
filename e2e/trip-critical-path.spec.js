const { test, expect } = require("@playwright/test");

// The critical path: dev sign-in → compose a trip → add + name an entry →
// solve the day → see Book → clean up. Exercises the real stack end-to-end
// (auth, create/persist, entry write, solve, navigation) on a NEW trip the
// dev-login user owns, so every write passes RLS.
test("compose → add entry → solve → book", async ({ page }) => {
  // 1. Dev sign-in (the prod-disabled /api/dev-login mints a real session).
  await page.goto("/trips");
  const devBtn = page.getByRole("button", { name: /Dev sign-in/i });
  await devBtn.waitFor({ state: "visible", timeout: 20_000 });
  await devBtn.click();

  // 2. Compose a new trip.
  await page.getByRole("button", { name: /New trip/i }).click();
  const dialog = page.getByRole("dialog", { name: /New trip/i });
  await expect(dialog).toBeVisible();
  const name = `E2E ${Date.now()}`;
  await dialog.getByPlaceholder(/Slovenia, the Dolomites/i).fill(name);
  const dates = dialog.locator('input[type="date"]');
  await dates.nth(0).fill("2026-09-10");
  await dates.nth(1).fill("2026-09-12");
  await dialog.getByRole("button", { name: /Create trip/i }).click();

  // Landed in the workspace for the new trip.
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(page.getByText(name)).toBeVisible();
  const tripUrl = page.url();
  const tripId = tripUrl.match(/\/trips\/([0-9a-f-]+)/)[1];

  // 3. Days: add an entry to the first day, name it in the editor, close.
  await page.goto(`/trips/${tripId}/days`);
  await page.locator(".tw-day .tw-add").first().click();
  const editor = page.getByRole("dialog", { name: /edit entry/i });
  await expect(editor).toBeVisible();
  await editor.getByPlaceholder("Untitled").fill("Morning walk");
  await editor.getByRole("button", { name: /Done/i }).click();
  await expect(page.getByText("Morning walk")).toBeVisible();

  // 4. Solve that day — the button is enabled once the day has an entry.
  const solve = page.locator(".tw-day .tw-solve").first();
  await expect(solve).toBeEnabled();
  await solve.click();
  await expect(page.getByText(/laid out/i)).toBeVisible();

  // Let the debounced writes (title edit + solve times) flush before we hard-
  // navigate, so a reload reflects them. The save pill settles to saved/synced.
  await expect(page.locator(".save-pill")).toHaveText(/saved|synced/i, { timeout: 10_000 });

  // 5. Book tab renders (the derived reservations/cash view).
  await page.goto(`/trips/${tripId}/book`);
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.locator("#tw-panel")).toBeVisible();

  // 6. Clean up — delete the whole trip we created, as its owner. /api/dev-login
  // returns the session token; the trips table's owner-only RLS lets that user
  // delete their own row, and trip_entries cascades. (No admin/pattern delete —
  // just the user removing the trip they just made.) Skipped if env is absent.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const { access_token } = await (await page.request.post("/api/dev-login")).json();
    const res = await page.request.delete(`${url}/rest/v1/trips?id=eq.${tripId}`, {
      headers: { apikey: key, Authorization: `Bearer ${access_token}` },
    });
    expect(res.ok()).toBeTruthy();
    // confirm it's gone
    await page.goto("/trips");
    await expect(page.getByText(name)).toHaveCount(0);
  }
});
