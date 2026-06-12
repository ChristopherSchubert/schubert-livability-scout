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
