-- 0018 — security hardening: the shared cache tables (pois, external_cache,
-- nominatim_cache) had RLS DISABLED while anon/authenticated held full
-- INSERT/UPDATE/DELETE/TRUNCATE grants — i.e. anyone with the public anon key
-- could poison or TRUNCATE the 18k-row pois cache that feeds both the
-- walking-core measurements and the GatherBucket suggestions. (#50)
--
-- Fix: enable RLS + a SELECT-only policy. Reads stay open (the data is public
-- place / geocode data the app reads client-side); writes are now blocked for
-- anon/authenticated because no write policy exists. The measurement pipeline
-- writes via direct Postgres (the `postgres` role bypasses RLS), so the
-- fetch-pois / measure scripts are unaffected. Idempotent.
--
-- APPLIED 2026-06-12 (owner-approved). Verified: rls=true + one SELECT policy
-- on each cache table; reads OK (18,390 pois); anon/authenticated writes denied.
do $$
declare t text;
begin
  foreach t in array array['pois', 'external_cache', 'nominatim_cache'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_read', t);
      execute format('create policy %I on public.%I for select to public using (true)', t || '_read', t);
    end if;
  end loop;
end $$;
