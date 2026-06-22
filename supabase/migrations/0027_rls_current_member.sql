-- 0027_rls_current_member.sql — Ticket 3 / #90 (epic #84), part 3 of 3.
-- Enable RLS on travel.* and create every policy, faithfully ported from the
-- LIVE schubert-travel policy set (pg_policies — schema.sql had drifted, missing
-- the pois/cache/trip_entries ones). The one substitution: owner checks move
-- from `auth.uid()` to `(select platform.current_member_id())` — because
-- platform.member.id ≠ auth.uid() (the contract's "RLS verbatim" was a defect).
-- Read stays shared where it was (the felt-score comparison across members);
-- writes are owner-only. Service-role bypasses RLS, so cache/pois writes (no
-- write policy) and the measurement pipeline are unaffected.

-- ── member mirror: readable by authed; writes only via sync_current_member() ──
alter table travel.member enable row level security;
create policy "member readable by authed" on travel.member for select to authenticated using (true);

-- ── cities (SHARED) ─────────────────────────────────────────────────────────
alter table travel.cities enable row level security;
create policy "cities readable by authed" on travel.cities for select to authenticated using (true);
create policy "cities writable by authed" on travel.cities for all to authenticated using (true) with check (true);

-- ── felt_surveys (read shared for comparison; write own) ─────────────────────
alter table travel.felt_surveys enable row level security;
create policy "felt readable by authed" on travel.felt_surveys for select to authenticated using (true);
create policy "felt insert own" on travel.felt_surveys for insert to authenticated with check (user_id = (select platform.current_member_id()));
create policy "felt update own" on travel.felt_surveys for update to authenticated using (user_id = (select platform.current_member_id()));
create policy "felt delete own" on travel.felt_surveys for delete to authenticated using (user_id = (select platform.current_member_id()));

-- ── journal_entries ─────────────────────────────────────────────────────────
alter table travel.journal_entries enable row level security;
create policy "journal readable by authed" on travel.journal_entries for select to authenticated using (true);
create policy "journal insert own" on travel.journal_entries for insert to authenticated with check (user_id = (select platform.current_member_id()));
create policy "journal update own" on travel.journal_entries for update to authenticated using (user_id = (select platform.current_member_id()));
create policy "journal delete own" on travel.journal_entries for delete to authenticated using (user_id = (select platform.current_member_id()));

-- ── baseline_ratings ────────────────────────────────────────────────────────
alter table travel.baseline_ratings enable row level security;
create policy "baseline readable by authed" on travel.baseline_ratings for select to authenticated using (true);
create policy "baseline insert own" on travel.baseline_ratings for insert to authenticated with check (user_id = (select platform.current_member_id()));
create policy "baseline update own" on travel.baseline_ratings for update to authenticated using (user_id = (select platform.current_member_id()));
create policy "baseline delete own" on travel.baseline_ratings for delete to authenticated using (user_id = (select platform.current_member_id()));

-- ── user_weights ────────────────────────────────────────────────────────────
alter table travel.user_weights enable row level security;
create policy "weights readable by authed" on travel.user_weights for select to authenticated using (true);
create policy "weights upsert own" on travel.user_weights for all to authenticated using (user_id = (select platform.current_member_id())) with check (user_id = (select platform.current_member_id()));

-- ── trips ───────────────────────────────────────────────────────────────────
alter table travel.trips enable row level security;
create policy "trips readable by authed" on travel.trips for select to authenticated using (true);
create policy "trips insert own" on travel.trips for insert to authenticated with check (user_id = (select platform.current_member_id()));
create policy "trips update own" on travel.trips for update to authenticated using (user_id = (select platform.current_member_id()));
create policy "trips delete own" on travel.trips for delete to authenticated using (user_id = (select platform.current_member_id()));

-- ── trip_entries (owner via the trips subquery) ─────────────────────────────
alter table travel.trip_entries enable row level security;
create policy "trip_entries readable by authed" on travel.trip_entries for select to authenticated using (true);
create policy "trip_entries insert own" on travel.trip_entries for insert to authenticated
  with check (trip_id in (select id from travel.trips where user_id = (select platform.current_member_id())));
create policy "trip_entries update own" on travel.trip_entries for update to authenticated
  using (trip_id in (select id from travel.trips where user_id = (select platform.current_member_id())))
  with check (trip_id in (select id from travel.trips where user_id = (select platform.current_member_id())));
create policy "trip_entries delete own" on travel.trip_entries for delete to authenticated
  using (trip_id in (select id from travel.trips where user_id = (select platform.current_member_id())));

-- ── trip_fork_comments (owner = author_id) ──────────────────────────────────
alter table travel.trip_fork_comments enable row level security;
create policy "fork comments readable by authed" on travel.trip_fork_comments for select to authenticated using (true);
create policy "fork comments insert own" on travel.trip_fork_comments for insert to authenticated with check (author_id = (select platform.current_member_id()));
create policy "fork comments update own" on travel.trip_fork_comments for update to authenticated using (author_id = (select platform.current_member_id()));
create policy "fork comments delete own" on travel.trip_fork_comments for delete to authenticated using (author_id = (select platform.current_member_id()));

-- ── pois (SHARED cache) — public read; writes service-role only ─────────────
alter table travel.pois enable row level security;
create policy "pois_read" on travel.pois for select to public using (true);

-- ── nominatim_cache (SHARED) — public read ─────────────────────────────────
alter table travel.nominatim_cache enable row level security;
create policy "nominatim_cache_read" on travel.nominatim_cache for select to public using (true);

-- ── external_cache (SHARED) — public read ──────────────────────────────────
alter table travel.external_cache enable row level security;
create policy "external_cache_read" on travel.external_cache for select to public using (true);

-- ── walkthrough_feedback — anon insert (Janice's public deck), authed read ──
alter table travel.walkthrough_feedback enable row level security;
create policy "walkthrough_feedback_insert" on travel.walkthrough_feedback for insert to anon, authenticated with check (true);
create policy "walkthrough_feedback_select" on travel.walkthrough_feedback for select to authenticated using (true);
