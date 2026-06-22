-- 0025_member_mirror.sql — Ticket 3 / #90 (epic #84), part 1 of 3.
-- The thin local mirror of platform identity (ADR 0003). travel.member.id IS the
-- platform member uuid (NOT auth.uid() — platform.member.auth_user_id is a
-- separate nullable link), so the per-user FKs + RLS re-point at this mirror.
-- Applied via the Supabase MCP to schubert-family; additive, schubert-travel
-- untouched.

create table if not exists travel.member (
  id           uuid primary key,                 -- = platform.member.id
  household_id uuid not null,
  display_name text not null,
  synced_at    timestamptz not null default now()
);

-- Upsert the calling user's platform member into the local mirror. SECURITY
-- DEFINER + empty search_path (every ref fully qualified) so it can read
-- platform.member across schemas safely. Called on sign-in by the app (#91).
create or replace function travel.sync_current_member()
returns travel.member language plpgsql security definer set search_path = '' as $$
declare m platform.member; r travel.member;
begin
  select * into m from platform.member where auth_user_id = auth.uid() and status = 'active' limit 1;
  if not found then raise exception 'no active platform member for %', auth.uid(); end if;
  insert into travel.member (id, household_id, display_name)
    values (m.id, m.household_id, m.display_name)
    on conflict (id) do update set household_id = excluded.household_id,
      display_name = excluded.display_name, synced_at = now()
    returning * into r;
  return r;
end $$;

-- Seed both active members now (interlock #4: Chris + Janice pre-added to
-- platform.member) so the FK re-point (0026) and the #89 per-user data copy have
-- valid owner targets without waiting on a first sign-in.
insert into travel.member (id, household_id, display_name)
select id, household_id, display_name from platform.member where status = 'active'
on conflict (id) do update set household_id = excluded.household_id,
  display_name = excluded.display_name, synced_at = now();
