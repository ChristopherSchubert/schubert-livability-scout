-- 0022 — trip_fork_comments: per-fork discussion thread shared between
-- travelers (Chris + Janice). A comment targets a fork's comparison view; it
-- may lean toward one option (choice_id = 'A'/'B') or address the fork
-- generally (choice_id IS NULL). Readable by any authenticated user (both
-- travelers co-view), writable only by the author. Mirrors 0019 exactly.
-- Idempotent. Additive — no drops.
create table if not exists trip_fork_comments (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips (id) on delete cascade,
  fork_id    text not null,
  choice_id  text,                    -- null = general comment on the fork; 'A'|'B'|… = re: that option
  author_id  uuid not null references profiles (id) on delete cascade,
  body       text not null default '',
  lean       text check (lean in ('up', 'down') or lean is null),  -- optional 👍/👎
  created_at timestamptz not null default now(),
  constraint trip_fork_comments_body_nonempty check (body <> '')
);

create index if not exists trip_fork_comments_trip_fork_idx
  on trip_fork_comments (trip_id, fork_id, created_at asc);

alter table trip_fork_comments enable row level security;

-- Drop before recreate so re-running is idempotent.
drop policy if exists "fork comments readable by authed"  on trip_fork_comments;
drop policy if exists "fork comments insert own"          on trip_fork_comments;
drop policy if exists "fork comments update own"          on trip_fork_comments;
drop policy if exists "fork comments delete own"          on trip_fork_comments;

-- RLS: both travelers read everything; each traveler writes only their own rows.
create policy "fork comments readable by authed"
  on trip_fork_comments for select to authenticated using (true);
create policy "fork comments insert own"
  on trip_fork_comments for insert to authenticated with check (author_id = auth.uid());
create policy "fork comments update own"
  on trip_fork_comments for update to authenticated using (author_id = auth.uid());
create policy "fork comments delete own"
  on trip_fork_comments for delete to authenticated using (author_id = auth.uid());
