# Testing

Two runners, split by what they test. `npm test` runs both (and CI runs
`npm test` on every push — see `.github/workflows/ci.yml`).

## Pure logic — `node:test` (zero-dep)

`npm run test:unit` → `node --test test/*.test.mjs`. The domain logic — scoring,
image queries, the trip model (`lib/trip.js`), the solver adapter, the Frame
derivation (`lib/trip-frame.js`), the window leg-math (`lib/trip-window.js`),
and variations (`lib/trip-variations.js`). Fast, no dependencies, no DOM.
**42 tests.** Files: `test/*.test.mjs`.

## React components — Vitest + Testing Library (#43)

`npm run test:components` → `vitest run`, scoped by `vitest.config.mjs` to
`test/components/**/*.test.jsx`, in jsdom with `@testing-library/react`. Covers
the rendering + interaction wiring: the display **atoms**, **EntryRow** (click +
keyboard → onEdit), **EntryEditor** (edit → updateEntry, Escape → close, remove
→ removeEntry, via a mocked `TripProvider`), **TripFrame** (derived facts +
honest blanks), **TripVariations** (fork creation tags entries + writes the
fork; switching persists the active choice), and **DayEntries** (the sortable
scaffold: a grip per row; grip click doesn't open the editor). **22 tests.**

Real pointer **drag→patch** isn't simulated here — jsdom has no layout engine,
so the reorder/leg-shift *math* is covered by the pure suites and the full drag
gesture belongs to the E2E layer (#44, Playwright). Components that pull a
context use `vi.mock("../../components/TripProvider", …)`; `test/components/setup.js`
loads the jest-dom matchers.

## E2E critical path — Playwright (#44)

`npm run test:e2e` → `playwright test` (config: `playwright.config.js`, spec:
`e2e/`). One critical-path test drives a real headless Chromium against the dev
server (reused if already up): **dev sign-in → compose a trip → add + name an
entry → solve the day → Book renders → clean up.**

- **Auth:** clicks the AuthGate "Dev sign-in" button (the prod-disabled
  `/api/dev-login` mints a real session).
- **RLS:** the test creates a *new* trip, so the dev-login user **owns** it and
  every write passes RLS (the seeded Slovenia trip is owned by someone else and
  is read-only to that user).
- **Self-cleanup:** at the end it deletes the trip it made via an owner-scoped
  Supabase REST call (token from `/api/dev-login`; `trip_entries` cascades), so
  runs leave no residue. The Supabase URL/key come from `.env.local`
  (read in the config); without them the cleanup step is skipped.

Not wired into the default `npm test` / CI: the E2E needs a running dev server +
the chromium binary (`npx playwright install chromium`) + the dev-login
credentials, so it's a separate, explicitly-run script. Pointer **drag** (the
one interaction jsdom can't cover for #43) is exercised here through the real
browser.
