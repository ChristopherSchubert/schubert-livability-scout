-- 0016 — trip_entries: one row per trip entry (normalizing the trips.entries
-- jsonb blob). Real-time co-editing (Janice + Chris) against a single blob
-- means every edit rewrites the whole array and concurrent writers clobber
-- each other (last-write-wins on the blob). One-row-per-entry gives per-entry
-- real-time, clean partial patches, and conflict isolation — editing the
-- balloon never touches lunch. (Epic #7, Phase 0, issue #8.)
--
-- `payload jsonb` holds the v2 entry atom (everything except id/day, which are
-- columns for indexing/RLS). Atom shape: features/trip-planner-components.md §3
-- (category × status, time bucket|range|point, place.placeId, structured cost,
-- booking, markers[], coveredBy). `sort` orders entries within a day.
--
-- Idempotent + RLS, mirroring the trips / felt_surveys policies. Owner-only
-- CRUD via the trip-ownership subquery; readable by authed (both travelers).
create table if not exists trip_entries (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  day         date,
  payload     jsonb not null default '{}',
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trip_entries_trip_day_idx on trip_entries (trip_id, day);

alter table trip_entries enable row level security;

-- READ: any authed user (both travelers — Janice + Chris co-view a trip), to
-- match the trips table's `select ... using (true)`. Owner-only-read would
-- leave a co-traveler seeing a trip frame with no entries. WRITE: owner only
-- (co-edit write-sharing is the harder real-time problem, tracked separately).
-- Drop-then-create so the migration is re-runnable (no `create policy if not
-- exists` in Postgres).
drop policy if exists "trip_entries readable by authed" on trip_entries;
create policy "trip_entries readable by authed" on trip_entries
  for select to authenticated
  using (true);

drop policy if exists "trip_entries insert own" on trip_entries;
create policy "trip_entries insert own" on trip_entries
  for insert to authenticated
  with check (trip_id in (select id from trips where user_id = auth.uid()));

drop policy if exists "trip_entries update own" on trip_entries;
create policy "trip_entries update own" on trip_entries
  for update to authenticated
  using (trip_id in (select id from trips where user_id = auth.uid()))
  with check (trip_id in (select id from trips where user_id = auth.uid()));

drop policy if exists "trip_entries delete own" on trip_entries;
create policy "trip_entries delete own" on trip_entries
  for delete to authenticated
  using (trip_id in (select id from trips where user_id = auth.uid()));

-- Real-time: add to the Supabase publication so postgres_changes events fire
-- for inserts/updates/deletes (the provider subscribes per trip). Guarded so
-- re-running doesn't error on "already a member".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_entries'
  ) then
    alter publication supabase_realtime add table trip_entries;
  end if;
end $$;
