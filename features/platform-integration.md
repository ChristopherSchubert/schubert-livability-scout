# Family-Hub Platform Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans to implement, task-by-task, with review checkpoints.
> Steps use checkbox (`- [ ]`) syntax. **This is an auth + production-DB migration:
> nothing here runs without the owner's explicit sign-off, and the cutover steps
> interlock with platform-side deliverables (see "Platform interlocks").**

**Goal:** Adopt the `schubert-family` platform contract (#84) — consolidate Travel's
database into a `travel` schema in the shared Supabase project, move identity onto the
platform's shared `auth.users` + member directory, and expose `GET /api/feed` — while
keeping Travel's repo, Vercel deployment, and subdomain unchanged.

**Architecture:** One shared Supabase project (`schubert-family`, `cigsjmoornigndaygqua`),
schema-per-app (ADR 0001). Travel's tables live in a `travel` schema; the client is scoped
to it via `db: { schema: 'travel' }`. Identity resolves through a thin local
`travel.member` mirror (id = the platform member uuid, ADR 0003), synced from
`platform.member`; every owner FK re-points at the mirror and every RLS policy is rewritten
from `= auth.uid()` to `= (select platform.current_member_id())`. The feed is one stateless
household-scoped endpoint the hub pulls with an HS256 service token.

**Tech stack:** Next.js (app router), `@supabase/ssr` (`createBrowserClient`) + bare
`@supabase/supabase-js` (server routes), Postgres/RLS, `pg` (measurement pipeline), zod.

**Decision lineage:** the platform's own `docs/discovery/livability-findings.md` initially
recommended *not* migrating Travel's schema ("leave it standalone, link from the
dashboard"). **ADR 0001 + 0003 (accepted 2026-06-14) supersede that** — schema-per-app
consolidation is the accepted decision. This plan implements the ADRs.

---

## Out of scope (firm)

- **Retiring `schubert-travel` is NOT in this work.** It stays live as a fallback;
  the owner decommissions it personally, ~weeks after cutover. The platform's
  conformance gate explicitly excludes retirement.
- Cross-app "sign-in once" SSO (parent-domain `.schubertfamily.com` cookie) is a
  **post-cutover** capability (platform #6 proven / #16 cutover, gated on the domain
  ~2026-06-16). Interim on `*.vercel.app`, each app signs in on its own origin.

## Phasing — DECIDED (A) all-in-one (platform steward, 2026-06-14)

The platform steward chose **(A) full consolidation this pass** (over feed-first):
Travel is the reference integration that proves identity/member/RLS end-to-end
before Finance adopts. Plan #88–#94 accepted as written; critical path
#89→#90→{#91,#93}→#94 confirmed; #90 (mirror + FK re-point + the
`owner = (select current_member_id())` rewrite) is the load-bearing one the steward
will audit closely.

✅ **Travel-side gate cleared (owner, 2026-06-14):** the owner gave direct go on
**(A) all-in-one** — the auth handoff + DB migration this pass — with one **absolute,
non-negotiable condition: never delete the existing `schubert-travel` database.**
Copy-only, re-point, verify; it stays live as the rollback and the owner retires it
by hand. #88 starts now; #89–#92 proceed as `schubert-family#19` interlocks land.

## Platform interlocks (deliverables the hub owes — track as blockers)

These are **not** Travel's tickets; they gate our cutover steps. Filed/confirmed in
`ChristopherSchubert/schubert-family`:

1. **Google OAuth provider + redirect URLs configured on `schubert-family`'s Auth**
   (provider creds are platform-owned; Travel never holds `GOOGLE_CLIENT_*`/`AUTH_SECRET`). → gates Ticket 4.
2. **`travel` schema exposed on the project Data API.** → gates Tickets 2–6.
3. **`travel` tables added to the `supabase_realtime` publication** — specifically **`travel.trips` and `travel.trip_entries`** (the only tables `subscribeTrip` listens to). → gates Ticket 4's realtime. Tracked as platform `schubert-family#19`.
4. **Chris + Janice pre-added to `platform.member`** (`status='active'`, with emails) so `reconcile_member()` email-matches on first sign-in. → gates Ticket 3 seeding + Ticket 4.
5. **`FEED_SERVICE_TOKEN_SIGNING_KEY` provisioned + a service token issued** for conformance testing. → gates Ticket 6.
6. **Contract docs reconciled** (the "RLS verbatim" wording, the seven-FK rule, token-rotation procedure) — informational; build against the corrected `/conformance` + `feed-contract.ts`.

## Safety scaffolding (every ticket)

- **The host move is ADDITIVE — copy, never move; never `DROP`.** Now canonical in the platform `/conformance`: create `schubert-family.travel`, **copy** the data, re-point + verify, then run on it. **No migration in this work may `DROP` `schubert-travel` or its objects** — it is the rollback path and stays live until the owner retires it by hand. `pg_dump` a backup first anyway.
- **Free-tier note:** the org is on the Supabase free plan (2-project cap already hit). Supabase **branching may be unavailable** — develop migrations against a **local stack** (`supabase start`) or a scratch schema, verify, then apply forward-only to `schubert-family`. Confirm branch availability before relying on it.
- **Narrow commits only** — stage exact paths (the tree carries unrelated WIP). **Pre-req: the existing uncommitted WIP (`CLAUDE.md` + several components) must be committed or stashed by the owner before this epic starts**, or migrations can't be cleanly committed.
- Each task is test-first where there's testable code; migrations are verified by query + the conformance harness.

---

## Live-data drift — copy → freeze → final sync → flip (mandatory)

Prod is live and in **daily use** on `schubert-travel`, so a one-shot copy at #89
would lose everything written between the copy and the #91 flip. Handle it as:

- **Classify tables (in #89):** *static reference* — `cities`, `pois`, `poi_positions`,
  `walkthrough_feedback` (owner-global, effectively static during the window) → copy once.
  *Mutable per-user* — the 7 owner tables (`felt_surveys`, `journal_entries`,
  `baseline_ratings`, `user_weights`, `trips`, `trip_entries`, `trip_fork_comments`) →
  re-synced at cutover.
- **Make the data copy idempotent (in #89):** upsert on PK so it can be re-run cheaply
  as the final delta.
- **At cutover (in #91): brief write-freeze + final delta-sync.** It's a 2-user app —
  coordinate a short maintenance window with Chris + Janice, stop writes, re-run the
  idempotent per-user-table copy (+ the old-uid → `member.id` FK remap on the delta),
  then flip the app env to `schubert-family`. No writes accepted on `schubert-travel`
  after the final sync.
- **Verify zero loss (in #94):** per-user-table row counts match `schubert-travel` ↔
  `schubert-family.travel` at the flip; spot-check the latest survey/trip/journal row is
  present post-cutover.

Don't build CDC/replication for two users — a coordinated freeze + idempotent re-copy is
simpler and loss-proof.

## Writer pre-flight — inputs the writer must have (not in tickets, by design)

These are operational inputs (secrets / access / values), deliberately kept out of
the backlog. The writer must have each in hand before the ticket that needs it.

- **Only #88 is startable today.** Live as of 2026-06-14: all five `schubert-family#19`
  deliverables are unchecked. #89 unblocks when the `travel` schema is exposed on the
  Data API; #91 on Google-redirects + realtime-publication + members; #93 on the signing key.
- **`schubert-family` credentials** (from owner/platform) — needed before #89/#92/#94:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
  → Vercel + `.env.local`; the Postgres pooler **DB password** → macOS Keychain
  (`supabase-db-password`) for the measurement pipeline (#92) and migrations.
- **`NEXT_PUBLIC_HUB_URL` value** (from owner/platform) — needed for #88. Interim
  `schubert-family.vercel.app`; post-cutover `schubertfamily.com`.
- **Test service token + `FEED_SERVICE_TOKEN_SIGNING_KEY`** (interlock #5) — needed for #93.
- **Read access to `ChristopherSchubert/schubert-family`** — to run
  `conformance/check-feed.mjs` (#93) and reference `feed-contract.ts` + the
  `platform.member` DDL / `current_member_id()` / `reconcile_member()` definitions (#90).
- **Clean working tree** — the pre-existing WIP (`CLAUDE.md` + `components/`/`lib/` edits)
  committed or stashed before #89's migrations, so migration commits stay narrow.

## File structure

**Create:**
- `supabase/migrations/0024_travel_schema.sql` — create `travel` schema, move/own all tables (or a documented `set search_path` strategy). *(Numbered from 0024 — `0023_trip_regions.sql` is already taken by #79.)*
- `supabase/migrations/0025_member_mirror.sql` — `travel.member` mirror + sync trigger/function.
- `supabase/migrations/0026_repoint_fks.sql` — drop `profiles`/`handle_new_user`, re-point 7 FKs to `travel.member`.
- `supabase/migrations/0027_rls_current_member.sql` — rewrite all RLS policies to `current_member_id()`.
- `app/api/feed/route.js` — the household-scoped feed endpoint.
- `lib/feed.js` — pure trip→card mapping (unit-tested).
- `src/lib/env.schema.js` (or `lib/env.js`) — zod boot validator for required env.
- `test/feed.test.mjs` — card-shape tests against the contract.
- `.env.example` — renamed from `.env.local.example`, full key catalog.

**Modify:**
- `lib/supabase.js:16-26` — add `{ db: { schema: 'travel' } }`; re-point URL/key to `schubert-family`.
- `app/api/dev-login/route.js`, `app/api/measure/route.js`, `app/api/walkthrough-feedback/route.js`, `lib/image-manifest.js:160` — add `db: { schema: 'travel' }` to each server `createClient`.
- `lib/db.js:331-346` (`subscribeTrip`) — change `schema: "public"` → `schema: "travel"` on both `postgres_changes` listeners.
- `components/AuthGate.jsx` — call `reconcile_member` on `SIGNED_IN`, then upsert the `travel.member` mirror row.
- `lib/measurers/_db.js` — re-point `host`/`user` to `schubert-family`'s pooler; Keychain password; `set search_path = travel`.
- `features/README.md` — index entry (this file).

---

## Ticket 1 — Env/config standardization + boot validator ✅ shipped (#88)

**Why first:** lowest-risk, mostly independent of the DB move, and de-risks every later
ticket (a missing var is the classic cutover failure). Travel already prefers
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with an anon fallback and holds **no**
`GOOGLE_CLIENT_*`/`AUTH_SECRET` (verified) — so this is mostly formalizing + a validator.

**Files:** Create `lib/env.js` + `instrumentation.js` + `.env.example`; modify
`lib/supabase.js`; sweep `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback from 6 other
callsites (4 API routes + `lib/image-manifest.js` + `scripts/hero-audit.mjs`).

- [x] Zod boot validator `lib/env.js` asserts the 4 required keys
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_HUB_URL`); wired to boot via
  `instrumentation.js` (Node runtime only). Optional keys typed (Unsplash,
  Census, Walkscore, Google Places, dev-login, Overpass).
- [x] Anon-key fallback dropped from `lib/supabase.js` **and** every other
  callsite (publishable key is set in both `.env.local` and Vercel; confirmed
  via `vercel env ls production`).
- [x] `.env.local.example` → `.env.example`; ~11 keys in the standard's
  section order (App / Supabase / Integrations / Local-dev).
- [x] **Tested both ways:** `test/env.test.mjs` covers happy path + per-key
  missing-required failures + the URL-format guard (6 tests, all pass).
  Verified with the real dev server: clean boot with all required env →
  `HTTP 200`; with `NEXT_PUBLIC_HUB_URL` removed → boot refuses with
  `Invalid environment — refusing to start: NEXT_PUBLIC_HUB_URL: …`.

**Outstanding (Vercel side, owner action):**
- [ ] Add `NEXT_PUBLIC_HUB_URL` to the Vercel project's Environment Variables
  (Production + Preview, value `https://schubert-family.vercel.app` interim
  → `https://schubertfamily.com` at cutover). **Required before the next prod
  push**, otherwise the validator refuses to boot in prod.

## Ticket 2 — Port schema + migrate data into `schubert-family.travel`

**Depends on:** interlock #2 (travel schema on Data API). Back up `schubert-travel` first.

**Files:** `supabase/migrations/0024_travel_schema.sql`.

- [x] **Schema ported + applied (2026-06-22).** `0024_travel_schema.sql` creates `travel` + all **13** live tables (the 11 in `schema.sql` **plus** `cities.matrix` and the two cache tables `nominatim_cache` / `external_cache` that `schema.sql` had drifted from — authored from the live `schubert-travel.public` schema, not `schema.sql`). Applied to `schubert-family` via the Supabase MCP. `profiles.id` is a bare uuid (the `auth.users` FK is dropped so old user_ids load; identity is #90); RLS left disabled (deferred to #90); intra-`travel` FKs preserved. Verified: 13 `travel.*` tables exist, 0 rows.
- [ ] **Data copy — BLOCKED on DB credentials (discovered 2026-06-22).** The "copy via MCP `execute_sql` generated INSERTs, no password needed" assumption is **empirically false**: MCP `execute_sql` has an output token cap that even **28 small rows (trips/baseline/etc.) exceed (78 KB)**, and `pois` is **18,393 rows**. A server-side `postgres_fdw`/`dblink` or `pg_dump | psql` bulk copy is the only viable path, and all of those need **travel's DB password** (`supabase-db-password`, currently **absent**) plus **family's** (`supabase-family-db-password`, the #92 slot, absent). → Add both to the Keychain, then run a local streaming upsert copy (idempotent on PK). The `pg_dump` backup bullet is covered by Supabase's managed daily backup of `schubert-travel` (owner-approved 2026-06-22), since this work never writes to it.
- [ ] **Verify:** row counts match the `schubert-travel` source for every table (`select count(*)` parity) — after the data copy.

**Acceptance:**
- [ ] `schubert-family.travel` has every Travel table with row-count parity to `schubert-travel`.
- [ ] `schubert-travel` is untouched and still live.

## Ticket 3 — Identity: member mirror + FK re-point + RLS rewrite

**Depends on:** Ticket 2 + interlock #4 (Chris/Janice in `platform.member`). **The load-bearing ticket.**

**Files:** Create `0025_member_mirror.sql`, `0026_repoint_fks.sql`, `0027_rls_current_member.sql`.

- [ ] `0024`: create the mirror + sync.
```sql
create table travel.member (
  id           uuid primary key,                 -- = platform.member.id
  household_id uuid not null,
  display_name text not null,
  synced_at    timestamptz not null default now()
);
-- Sync helper: upsert the caller's platform member into the local mirror.
create or replace function travel.sync_current_member()
returns travel.member language plpgsql security definer set search_path = '' as $$
declare m platform.member; r travel.member;
begin
  select * into m from platform.member where auth_user_id = auth.uid() and status='active' limit 1;
  if not found then raise exception 'no active platform member for %', auth.uid(); end if;
  insert into travel.member (id, household_id, display_name)
    values (m.id, m.household_id, m.display_name)
    on conflict (id) do update set household_id=excluded.household_id,
      display_name=excluded.display_name, synced_at=now()
    returning * into r;
  return r;
end $$;
```
- [ ] Seed the mirror: have Chris + Janice sign in once (post-Ticket-4) **or** seed both rows directly from `platform.member` by email. Build the remap map `old schubert-travel auth uid → email → platform.member.id` (emails come from the `schubert-travel` `auth.users` dump; only 2 users).
- [ ] `0025`: remap each per-user table's owner column from the old auth uid to the matched `member.id`; **drop** `profiles` + `handle_new_user` + `on_auth_user_created`; re-point all seven FKs to `travel.member(id)`:
  `felt_surveys.user_id`, `journal_entries.user_id`, `baseline_ratings.user_id`,
  `user_weights.user_id`, `trips.user_id`, `trip_fork_comments.author_id`
  (+ `trip_entries` is owner-via-subquery — no column, but its policy changes in `0026`).
- [ ] `0026`: rewrite every policy. Pattern — replace `auth.uid()` with `(select platform.current_member_id())`:
```sql
-- example: felt_surveys
drop policy "felt insert own" on travel.felt_surveys;
create policy "felt insert own" on travel.felt_surveys for insert to authenticated
  with check (user_id = (select platform.current_member_id()));
-- ...repeat for update/delete and for journal_entries, baseline_ratings,
-- user_weights, trips, trip_fork_comments (author_id), and:
drop policy "trip_entries insert own" on travel.trip_entries;
create policy "trip_entries insert own" on travel.trip_entries for insert to authenticated
  with check (trip_id in (select id from travel.trips
                          where user_id = (select platform.current_member_id())));
-- ...update/delete likewise.
```
- [ ] **Test (TDD via two seeded members):** as Chris's session, insert/select own `felt_surveys` → allowed; attempt to read/write Janice's row → blocked. Repeat for `trips`/`trip_entries`. The per-user comparison (Chris vs Janice felt scores) must still hold.

**Acceptance:**
- [ ] All 11 policies + the `trip_entries` subquery resolve via `current_member_id()`; per-user isolation verified for both members.
- [ ] `profiles` + `handle_new_user` dropped; all 7 FKs point at `travel.member`.
- [ ] Existing rows remapped to the correct `member.id` (no orphaned owners).

## Ticket 4 — App client + auth + realtime re-point

**Depends on:** Tickets 2–3 + interlocks #1 (Google provider) and #3 (realtime publication).

**Files:** Modify `lib/supabase.js`, the four server `createClient` sites, `lib/db.js:331-346`, `components/AuthGate.jsx`.

- [ ] `lib/supabase.js`: `createBrowserClient(url, key, { db: { schema: 'travel' }, cookieOptions: { domain: isProd ? '.schubertfamily.com' : undefined, sameSite: 'lax', secure: true } })`; point `NEXT_PUBLIC_SUPABASE_URL`/key at `schubert-family` (in `.env.local` + Vercel). **The `.schubertfamily.com` cookie scope is what delivers cross-app SSO** (platform spike `schubert-family#6`) — moving to shared `auth.users` alone is *not* enough; without the parent-domain cookie, users still get a second login.
- [ ] Add `{ db: { schema: 'travel' } }` (or `auth: {...}, db: {...}`) to the bare `createClient` in `app/api/dev-login/route.js`, `app/api/measure/route.js`, `app/api/walkthrough-feedback/route.js`, `lib/image-manifest.js:160`.
- [ ] `AuthGate.jsx`: on `SIGNED_IN`, call `await getSupabase().schema('platform').rpc('reconcile_member')` then `await getSupabase().schema('travel').rpc('sync_current_member')` before flipping the gate (so the mirror exists before any per-user read). Keep the existing `signInWithOAuth({provider:'google', redirectTo: window.location.origin})` — only the project it authenticates against changes.
- [ ] `lib/db.js` `subscribeTrip`: change both `schema: "public"` → `schema: "travel"`.
- [ ] **Verify in preview** (auth-bypass `/api/dev-login`): sign in, confirm the gate flips, a trip loads, an edit round-trips, and realtime fires (open two tabs).

**Acceptance:**
- [ ] Sign-in against `schubert-family` works; `reconcile_member` + mirror sync run; gate flips.
- [ ] `/trips` reads/writes against `travel.*`; realtime updates propagate.
- [ ] `dev-login` still works (localhost-only).
- [ ] Browser-client session cookie scoped to `.schubertfamily.com` in production (host-only in dev).
- [ ] **Cross-app SSO verified:** already signed in on `schubertfamily.com`, opening `travel.schubertfamily.com` lands in the authed app with **no second sign-in**.

## Ticket 5 — Re-point the local measurement pipeline

**Depends on:** Ticket 2. (Independent of app auth.)

**Files:** Modify `lib/measurers/_db.js`.

- [ ] Re-point `host`/`user` to `schubert-family`'s pooler (`...pooler.supabase.com`, user `postgres.cigsjmoornigndaygqua`); store the new DB password in Keychain (service `supabase-db-password`); set `search_path = travel` on connect.
- [ ] **Verify:** run one read-only measurer query against `schubert-family.travel` and confirm it returns a known city's row. Do **not** run a paid Google fetch.

**Acceptance:**
- [ ] The pipeline connects to `schubert-family.travel` and reads/writes a city row.
- [ ] Keychain holds the new password; CLAUDE.md "two secret stores" note updated.

## Ticket 6 — `GET /api/feed` + token verification + conformance

**Depends on:** Ticket 3 (member/household) + interlock #5 (signing key/token).

**Files:** Create `app/api/feed/route.js`, `lib/feed.js`, `test/feed.test.mjs`.

- [ ] `lib/feed.js`: pure `tripsToCards(trips, { memberByTrip })` → cards matching `feed-contract.ts`: `{ key:'trip:<id>', kind:'countdown', title:'Trip to <name>', body:'<n> days away', event_at:start_date, deep_link:'<HUB or app>/trips/<id>', member_id: <member uuid | null=household-wide>, priority }`. ~1 card/trip. Summaries only — never raw rows.
- [ ] **Test first** (`test/feed.test.mjs`): assert each card has non-empty `key`/`title`, `kind` ∈ enum, `member_id` is a uuid-or-null, `event_at` ISO — i.e. mirror `check-feed.mjs`'s assertions on sample trips.
- [ ] `app/api/feed/route.js`: verify `Authorization: Bearer <token>` HS256 against `FEED_SERVICE_TOKEN_SIGNING_KEY`; reject tokenless calls; query the household's trips via `current_household_id()`; return `{ cards }`.
- [ ] **Verify:** `node conformance/check-feed.mjs <preview-url>/api/feed <service-token>` exits 0 against a Travel preview.

**Acceptance:**
- [ ] `/api/feed` returns contract-valid cards (~1/trip), rejects tokenless calls, passes `check-feed.mjs`.
- [ ] No raw data in any card (summaries only).

## Ticket 7 — Cutover verification (no retirement)

**Depends on:** Tickets 2–6 + all interlocks.

- [ ] Run the full conformance checklist: client scoped to `travel`, identity native, `check-feed.mjs` green.
- [ ] Verify **prod** (Vercel) signs in + reads/writes against `schubert-family`; verify the **local pipeline** measures; verify **realtime**; verify per-user isolation (Chris vs Janice).
- [ ] Update `features/deployment.md` (new project, env), this doc's status, and CLAUDE.md (Supabase project ref, two-secret-stores note). **Leave `schubert-travel` live.**

**Acceptance:**
- [ ] Platform conformance bar met: (a) data in `schubert-family.travel`, (b) identity on the shared project, (c) feed passes.
- [ ] Prod + pipeline + realtime + per-user isolation all verified post-cutover.
- [ ] `schubert-travel` still live as fallback; retirement left to the owner.

---

## Self-review

- **Spec coverage:** contract §1 identity → Tickets 3–4; §2 members/mirror → Ticket 3; §3 feed → Ticket 6; env standard → Ticket 1; realtime → Ticket 4; pipeline (Travel-specific) → Ticket 5; conformance → Tickets 6–7. The seven FKs + `trip_entries` subquery are all enumerated in Ticket 3.
- **Interlocks:** each cutover ticket names its platform dependency; none assume platform work is done.
- **Naming consistency:** `travel.member`, `platform.current_member_id()`, `platform.reconcile_member()`, `travel.sync_current_member()` used consistently across tickets.
- **Out-of-scope guard:** retirement excluded in three places (header, out-of-scope, Ticket 7).

## Follow-ups (tracked as GitHub issues)

Child tickets of epic #84 — see the issue links added when filed.
