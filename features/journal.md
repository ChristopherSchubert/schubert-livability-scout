# Journal mode

A phone-friendly, per-city journal for capturing impressions **on the ground** —
the thing the owner said matters most "when you're walking around the city." A
timestamped log (not a one-shot survey): jot a note the moment you have it.

## What it is

Each city gets a **Journal** sub-tab (`/cities/[slug]/journal`). At the top, a
compose card: a big textarea ("What's it like here, right now?"), four optional
reaction buttons (loved 😍 / liked 🙂 / mixed 😐 / no 🙁), an optional free-text
"where" (e.g. "the lake promenade"), and Save. Below, the entries newest-first,
each with an inline edit and a delete. Empty state invites the first note.

This is **Track 2-adjacent but distinct**: the felt-score survey (`Decide` /
`/assess`) is one structured post-visit judgment per city; the journal is many
raw moments. They don't blend.

## How it works

- **Storage:** `journal_entries` (per-user, migration **0019**) — a log keyed by
  `(city_id, user_id)` with `body`, `reaction`, `at_place`, `created_at`. RLS:
  readable by both users (compare notes), writable only by the owner — the same
  shape as `felt_surveys`. `on delete cascade` from `cities`.
- **db layer** (`lib/db.js`): `fetchMyJournal(userId)` → `{cityId: [entry,…]}`
  newest-first; `insertJournalEntry` (returns the saved row), `updateJournalEntry`,
  `deleteJournalEntry`.
- **Provider** (`components/PlannerProvider.jsx`): journal loads on mount
  (merged onto each city as `cityItem.journal`) and is **non-fatal** — if 0019
  isn't applied yet it degrades to "no journal" instead of breaking the cities
  load. Actions: `addJournalEntry` (awaited, like `addCity`), `editJournalEntry`,
  `removeJournalEntry` (optimistic).
- **UI:** `components/Journal.jsx` (body) + `components/JournalRoute.jsx` (the
  AppShell wrapper, mirrors `CityDetailRoute`) + `app/cities/[slug]/journal/page.js`.
  Nav tab added in `defaultCityNav` (`components/AppShell.jsx`). Styles in
  `app/journal.css` (`jr-*`). Tests: `test/components/Journal.test.jsx` (5).

## Status

Built + tested (component tests pass; route + empty state verified in-browser).
**Migration 0019 awaits an authorized apply to production** — the code ships
safely without it (graceful degradation), and save/load goes live once it's
applied.

## Follow-ups

- The original sketch wanted the journal to **auto-surface when today falls in
  `arriveDate`–`departDate`** (during the actual visit). Shipped as an
  always-available tab instead; a "you're on this trip now" highlight could come
  later.
- Photos per entry (the schema has room to add a `photo_url`).
