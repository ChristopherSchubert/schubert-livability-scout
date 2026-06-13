-- 0019 — journal_entries: the phone-friendly during/after-visit journal. Unlike
-- felt_surveys (one survey per city/user), the journal is a LOG: many timestamped
-- notes per city, per user. Each note is a moment captured on the ground —
-- free-text body, an optional quick reaction, an optional "where". Per-user,
-- readable by both (Janice + Chris compare notes), writable only by the owner.
-- Idempotent. Mirrors the felt_surveys RLS shape.
create table if not exists journal_entries (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references cities (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  body       text not null default '',
  reaction   text,                 -- optional quick tag: loved | liked | mixed | no
  at_place   text,                 -- optional free-text "where" (e.g. "the lake promenade")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists journal_entries_city_user_idx
  on journal_entries (city_id, user_id, created_at desc);

alter table journal_entries enable row level security;
drop policy if exists "journal readable by authed" on journal_entries;
drop policy if exists "journal insert own" on journal_entries;
drop policy if exists "journal update own" on journal_entries;
drop policy if exists "journal delete own" on journal_entries;
create policy "journal readable by authed" on journal_entries for select to authenticated using (true);
create policy "journal insert own" on journal_entries for insert to authenticated with check (user_id = auth.uid());
create policy "journal update own" on journal_entries for update to authenticated using (user_id = auth.uid());
create policy "journal delete own" on journal_entries for delete to authenticated using (user_id = auth.uid());
