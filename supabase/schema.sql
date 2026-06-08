-- Livability Scout — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Multi-user (Chris & Janice) with Google auth. Shared candidate data;
-- per-user felt surveys, baseline ratings, weights, and notes.

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per signed-in user, mirroring auth.users. display_name is "Chris"
-- or "Janice" — shown when comparing each other's ratings.
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row on signup; seed display_name from the Google name.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── cities (SHARED) ──────────────────────────────────────────────────────
-- The candidate slate + objective metrics + visit window + trip logistics.
-- Both users read and write these collaboratively.
create table if not exists cities (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  slug               text not null,
  stay_zone          text,
  heart_intersection text,
  trip_week          text,
  why                text,
  blocks             jsonb default '[]',
  block_geometries   jsonb default '[]',        -- per-block { name, lat, lon, accuracy, source, meta, asOf } — populated by lib/measurers/blocks.js
  status             text default 'Idea',
  decision           text default 'Undecided',
  is_calibration     boolean not null default false,  -- cohort flag: baseline place, not a candidate
  hero_image         text,
  arrive_date        text,
  depart_date        text,
  trip_length        text,
  flight_details     text,
  car_details        text,
  lodging_details    text,
  logistics_notes    text,
  days               jsonb default '[]',
  checklists         jsonb default '{}',
  measured_metrics   jsonb default '{}',        -- { key: { value, asOf } }
  measured_at        date,                      -- when the pipeline last ran
  water_target       jsonb,                     -- user-picked water body { name, point, … } for water_dist_m
  stay_zone_boundary jsonb,                     -- GeoJSON polygon: the adaptive stay-zone
  boundary_source    text,                      -- provenance of stay_zone_boundary (Census/OSM/NRHP/circle/…)
  boundary_set_at    date,                      -- when the boundary was last fetched
  horizon_features   jsonb,                     -- visible peaks { peaks: [{ name, angle, dir, … }], occupancyPct }
  lat                double precision,          -- geocoded heart (persisted, reused)
  lon                double precision,
  geo_source         text,                      -- provenance of lat/lon
  geocoded_at        date,
  visit_climate      jsonb,                     -- [12] monthly normals
  crowd_season       jsonb,                     -- [12] 0-5
  season_notes       jsonb,                     -- { charm, truth }
  drive_hrs_from_pit text,                      -- '4.5' (hours, string) | 'FLY' | null
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Idempotent for older deployments that pre-date a column.
alter table cities add column if not exists drive_hrs_from_pit text;
alter table cities add column if not exists is_calibration     boolean not null default false;
alter table cities add column if not exists water_target       jsonb;
alter table cities add column if not exists stay_zone_boundary jsonb;
alter table cities add column if not exists boundary_source    text;
alter table cities add column if not exists boundary_set_at    date;
alter table cities add column if not exists horizon_features   jsonb;
alter table cities add column if not exists population_total    integer;
alter table cities add column if not exists population_source   text;
alter table cities add column if not exists crowd_season_source text;
alter table cities add column if not exists crowd_intensity     int;
alter table cities add column if not exists nps_unit_code       text;
alter table cities add column if not exists crowd_raw           jsonb;
alter table cities add column if not exists block_geometries    jsonb default '[]';
alter table cities add column if not exists eu_lau              jsonb;
alter table cities add column if not exists planning_order      integer;

-- ── felt_surveys (PER-USER) ────────────────────────────────────────────────
-- Each person's post-visit survey for a city. Readable by both (to compare),
-- writable only by the owner.
create table if not exists felt_surveys (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references cities (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  setting    int, aliveness int, fabric int, realness int, january int,
  slovenia   int,
  note       text,
  context    text,                              -- 'memory' | 'visited'
  taken_at   date,
  updated_at timestamptz not null default now(),
  unique (city_id, user_id)
);

-- ── baseline_ratings (PER-USER) ─────────────────────────────────────────────
-- Reference places (Bled, Piran, Shadyside, …) rated from memory. The answer
-- key. Keyed by place name (these aren't candidate cities).
create table if not exists baseline_ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  place_name text not null,
  setting    int, aliveness int, fabric int, realness int, january int,
  slovenia   int,
  note       text,
  context    text default 'memory',
  taken_at   date,
  updated_at timestamptz not null default now(),
  unique (user_id, place_name)
);

-- ── user_weights (PER-USER) ─────────────────────────────────────────────────
-- Each person's Calibrate weights. One row per user.
create table if not exists user_weights (
  user_id uuid primary key references profiles (id) on delete cascade,
  weights jsonb not null default '{}'
);

-- ── pois (SHARED, cached) ───────────────────────────────────────────────────
-- Local cache of social POIs from Google Places (New). OSM coverage was too
-- thin to measure social life; this is the durable store so Google is hit once
-- per city (scripts/.fetch-pois.mjs) and queried offline after. Global (one row
-- per place_id) — a POI is looked up by lat/lon radius, so it serves every
-- nearby city. See migrations/0008_pois.sql.
create table if not exists pois (
  place_id          text primary key,
  name              text,
  lat               double precision not null,
  lon               double precision not null,
  primary_type      text,
  types             text[],
  rating            real,
  user_rating_count integer,
  price_level       text,
  business_status   text,
  street            text,
  formatted_address text,
  source            text not null default 'google_places',
  fetched_at        timestamptz not null default now()
);
create index if not exists pois_lat_lon_idx on pois (lat, lon);
create index if not exists pois_primary_type_idx on pois (primary_type);

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table profiles        enable row level security;
alter table cities          enable row level security;
alter table felt_surveys    enable row level security;
alter table baseline_ratings enable row level security;
alter table user_weights    enable row level security;

-- profiles: everyone signed in can read names; you update only your own.
create policy "profiles readable by authed" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid());

-- cities: shared. Any authed user reads and writes.
create policy "cities readable by authed"  on cities for select to authenticated using (true);
create policy "cities writable by authed"  on cities for all    to authenticated using (true) with check (true);

-- felt_surveys: readable by both (comparison), writable only by owner.
create policy "felt readable by authed" on felt_surveys for select to authenticated using (true);
create policy "felt insert own"  on felt_surveys for insert to authenticated with check (user_id = auth.uid());
create policy "felt update own"  on felt_surveys for update to authenticated using (user_id = auth.uid());
create policy "felt delete own"  on felt_surveys for delete to authenticated using (user_id = auth.uid());

-- baseline_ratings: same pattern.
create policy "baseline readable by authed" on baseline_ratings for select to authenticated using (true);
create policy "baseline insert own" on baseline_ratings for insert to authenticated with check (user_id = auth.uid());
create policy "baseline update own" on baseline_ratings for update to authenticated using (user_id = auth.uid());
create policy "baseline delete own" on baseline_ratings for delete to authenticated using (user_id = auth.uid());

-- user_weights: each user owns their row.
create policy "weights readable by authed" on user_weights for select to authenticated using (true);
create policy "weights upsert own" on user_weights for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
