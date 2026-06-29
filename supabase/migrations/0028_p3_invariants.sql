-- 0028_p3_invariants.sql — Trip Composer P3 / #109, invariants the data layer
-- must enforce so the UI's "Planned ⟺ has-a-trip-leg" rule can't drift.
--
-- Adds:
--   • travel.cities.archived_at — nullable soft-delete timestamp. We don't hard-
--     delete cities (every city carries irreplaceable measurement + survey
--     history that other rows depend on).
--   • travel.city_archive_guard() — trigger function refusing to set
--     archived_at when the city is still attached as a leg to any trip. The
--     leg relationship is jsonb-only (trips.legs[*].cityId), so this can't be
--     a FK; the trigger is the data-layer guarantee.
--
-- Trip owner (invariant #3) is already enforced: trips.user_id NOT NULL FK
-- travel.member(id). Trip-deletion cascade (invariant #1) holds automatically
-- post-#108: removing a trip drops its legs from jsonb → PlannerProvider's
-- inTripCitySet shrinks → cityStage falls through. No DDL needed for those.
-- Stage-advance guard (invariant #4) is deferred per the design spec.

alter table travel.cities
  add column if not exists archived_at timestamptz;

create or replace function travel.city_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only guard the transition from "not archived" → "archived". Updates that
  -- leave archived_at alone or restore from archived → null are not gated.
  if new.archived_at is not null and (old.archived_at is null) then
    if exists (
      select 1
      from travel.trips t,
           jsonb_array_elements(coalesce(t.legs, '[]'::jsonb)) leg
      where leg->>'cityId' = new.id::text
    ) then
      raise exception
        'cannot archive city % — still attached to trip(s); remove leg first',
        new.id;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists cities_archive_guard on travel.cities;
create trigger cities_archive_guard
  before update on travel.cities
  for each row
  execute function travel.city_archive_guard();
