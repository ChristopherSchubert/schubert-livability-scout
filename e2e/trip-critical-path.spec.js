const { test, expect } = require("@playwright/test");

// Trip this run created, registered the moment it exists so teardown can always
// remove it — even if a later assertion throws (otherwise the trip leaks into
// the shared Supabase). #86.
let createdTripId = null;

// Guaranteed teardown: runs on every outcome (pass or mid-test failure). Deletes
// the created trip as its owner via the trips table's owner-only RLS. Refuses to
// skip silently — if a trip exists but cleanup creds are missing (e.g. CI without
// .env.local), it fails loudly so the leak can't accrete unnoticed (#74 → #86).
test.afterEach(async ({ request }) => {
  const id = createdTripId;
  createdTripId = null;
  if (!id) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      `E2E created trip ${id} but cannot tear it down: NEXT_PUBLIC_SUPABASE_URL / ` +
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing. Provide them (.env.local or CI ` +
      `env) so the shared Supabase isn't polluted.`,
    );
  }
  const { access_token } = await (await request.post("/api/dev-login")).json();
  const res = await request.delete(`${url}/rest/v1/trips?id=eq.${id}`, {
    headers: { apikey: key, Authorization: `Bearer ${access_token}` },
  });
  expect(res.ok(), `teardown DELETE of trip ${id} failed (${res.status()})`).toBeTruthy();
});

// The critical path: dev sign-in → compose a trip → add + name an entry →
// solve the day → see Book. Exercises the real stack end-to-end (auth,
// create/persist, entry write, solve, navigation) on a NEW trip the dev-login
// user owns, so every write passes RLS. Teardown lives in afterEach above.
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

  // Landed in the workspace for the new trip. Register the id for teardown the
  // instant the URL is known — before any further assertion can fail and leak it.
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/, { timeout: 20_000 });
  const tripUrl = page.url();
  const tripId = tripUrl.match(/\/trips\/([0-9a-f-]+)/)[1];
  createdTripId = tripId;
  // The workspace shows the name in the editable "Trip name" field, so assert on
  // its value (getByText doesn't match input values).
  await expect(page.getByRole("textbox", { name: "Trip name" })).toHaveValue(name);

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

  // Teardown (delete the trip we created) runs in afterEach — guaranteed even if
  // an assertion above throws.
});
