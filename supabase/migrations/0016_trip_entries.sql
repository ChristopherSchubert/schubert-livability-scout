-- 0016 — trip_entries: one row per entry, normalizing entries out of the single
-- `trips.entries` jsonb blob (migration 0013). Real-time co-editing (Janice +
-- Chris, epic #7 locked decision #3) fights one blob: every edit rewrites the
-- whole array and concurrent writers last-write-wins-clobber each other. A row
-- per entry gives per-entry real-time, clean per-entry patches, and conflict
-- isolation (editing the balloon never touches lunch). The trip row keeps the
-- slow frame (name/dates/legs/glance/passes/travelers/options); see issue #8.
--
-- `payload jsonb` holds the v2 entry atom — everything EXCEPT id/day, which are
-- columns so they can be indexed (day) and RLS-checked (via trip_id). The atom
-- shape is the entry-atom v2 in features/trip-planner-components.md §3:
--   { role, time, category, status, title, note, place, meetingPoint, arriveBy,
--     vendor, contact, url, wear, bring, requirements, cost, booking,
--     transport, coveredBy, openHours, markers[] }
-- `sort` orders entries within a (trip, day) independently of clock time, so
-- fuzzy/bucketed entries keep a stable user-chosen order before Solve assigns
-- times. Run by hand in the Supabase SQL editor (no CLI); idempotent.

create table if not exists trip_entries (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  day         date,
  payload     jsonb not null default '{}',
  sort        int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists trip_entries_trip_day_idx on trip_entries (trip_id, day);

alter table trip_entries enable row level security;

-- A user can CRUD an entry iff they own its trip. Ownership is resolved through
-- the parent `trips` row (the entries table carries no user_id of its own —
-- trip_id is the single source of ownership truth). Guarded so re-running the
-- migration in the SQL editor is safe (create policy has no IF NOT EXISTS).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'trip_entries' and policyname = 'trip_entries select own') then
    create policy "trip_entries select own" on trip_entries for select to authenticated
      using (trip_id in (select id from trips where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'trip_entries' and policyname = 'trip_entries insert own') then
    create policy "trip_entries insert own" on trip_entries for insert to authenticated
      with check (trip_id in (select id from trips where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'trip_entries' and policyname = 'trip_entries update own') then
    create policy "trip_entries update own" on trip_entries for update to authenticated
      using (trip_id in (select id from trips where user_id = auth.uid()))
      with check (trip_id in (select id from trips where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'trip_entries' and policyname = 'trip_entries delete own') then
    create policy "trip_entries delete own" on trip_entries for delete to authenticated
      using (trip_id in (select id from trips where user_id = auth.uid()));
  end if;
end $$;

-- Real-time: add trip_entries to the supabase_realtime publication so a change
-- emits a postgres_changes event the TripProvider can merge (issue #12). Guarded
-- because `alter publication ... add table` errors if the table is already a
-- member (no IF NOT EXISTS form).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_entries'
  ) then
    alter publication supabase_realtime add table trip_entries;
  end if;
end $$;
