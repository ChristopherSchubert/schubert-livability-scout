-- 0013 — trips: a first-class multi-city Trip entity, the spine of the trip
-- planner (features/trip-planner-components.md). A Trip groups cities + days +
-- entries as one object (Slovenia = Ljubljana + Bled + Piran under one Trip),
-- so multi-city trips and "shift to next year" are first-class. Supersedes the
-- per-city `itinerary` column (migration 0012) as the primary model; that
-- column stays as a migration source and is deprecated, not dropped.
--
-- jsonb-heavy to match the codebase. Round-tripped through lib/trip.js.
-- Per-user + RLS, mirroring felt_surveys / baseline_ratings.
--
-- Shapes:
--   glance   { driveFrom, lodging, checkIn, diet, travelers[], pets[], theme, weather }
--   preTrip  { limitations[], bookingChecklist[], tips[], sources[] }
--   legs     [ { cityId, name, arrive, depart, lodging, checkIn } ]
--   options  { directory[], excursions[], alternates[] }
--   entries  [ { id, day, cityId, time, kind, role, title, note, place,
--               markers[], booking, cost } ]   -- time: point|range|fuzzy;
--               role: anchor|connective; markers: { type, value?, source? }
create table if not exists trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  name        text not null,
  theme       text,
  start_date  date,
  end_date    date,
  glance      jsonb default '{}',
  pre_trip    jsonb default '{}',
  legs        jsonb default '[]',
  options     jsonb default '{}',
  entries     jsonb default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table trips enable row level security;

create policy "trips readable by authed" on trips for select to authenticated using (true);
create policy "trips insert own" on trips for insert to authenticated with check (user_id = auth.uid());
create policy "trips update own" on trips for update to authenticated using (user_id = auth.uid());
create policy "trips delete own" on trips for delete to authenticated using (user_id = auth.uid());
