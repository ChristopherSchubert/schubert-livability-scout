-- 0024_travel_schema.sql — Ticket 2 / #89 (epic #84): port Travel's tables into
-- the `travel` schema of the shared `schubert-family` project.
--
-- ADDITIVE ONLY. This never touches `schubert-travel` (the live app + rollback
-- path). Authored from the LIVE `schubert-travel.public` schema (not
-- supabase/schema.sql, which had drifted — it omits cities.matrix and the two
-- cache tables). `create … if not exists` throughout so it is safe to re-run.
--
-- Deliberate deferrals, owned by later tickets:
--   • IDENTITY (#90): profiles.id is a bare uuid here — the `references
--     auth.users` FK is DROPPED so the old schubert-travel user_ids can load as
--     a faithful copy. Ticket 3 (#90) mirrors them to platform.member, re-points
--     the FKs, and rewrites identity. The handle_new_user trigger is NOT ported
--     (it is auth glue #90 redoes).
--   • RLS (#90): left disabled on travel.* for now ("off/old"); #90 rewrites the
--     policies via current_member_id(). Interim access is service-role only; the
--     app client doesn't reach `travel` until #91.

create schema if not exists travel;

-- ── profiles (identity mirror; FK to auth.users deferred to #90) ────────────
create table if not exists travel.profiles (
  id           uuid primary key,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ── cities (SHARED) ─────────────────────────────────────────────────────────
create table if not exists travel.cities (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  slug                text not null,
  stay_zone           text,
  heart_intersection  text,
  trip_week           text,
  why                 text,
  blocks              jsonb default '[]'::jsonb,
  status              text default 'Idea'::text,
  decision            text default 'Undecided'::text,
  hero_image          text,
  arrive_date         text,
  depart_date         text,
  trip_length         text,
  flight_details      text,
  car_details         text,
  lodging_details     text,
  logistics_notes     text,
  days                jsonb default '[]'::jsonb,
  checklists          jsonb default '{}'::jsonb,
  matrix              jsonb default '{}'::jsonb,
  measured_metrics    jsonb default '{}'::jsonb,
  visit_climate       jsonb,
  crowd_season        jsonb,
  season_notes        jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  lat                 double precision,
  lon                 double precision,
  geo_source          text,
  geocoded_at         date,
  measured_at         date,
  water_target        jsonb,
  horizon_features    jsonb,
  is_calibration      boolean not null default false,
  stay_zone_boundary  jsonb,
  drive_hrs_from_pit  text,
  boundary_set_at     date,
  boundary_source     text,
  block_geometries    jsonb,
  population_total    integer,
  population_source   text,
  crowd_season_source text,
  crowd_intensity     integer,
  eu_lau              jsonb,
  nps_unit_code       text,
  crowd_raw           jsonb,
  planning_order      integer,
  poi_positions       jsonb default '[]'::jsonb,
  blocks_authored     jsonb default '[]'::jsonb,
  block_blurbs        jsonb default '[]'::jsonb,
  itinerary           jsonb,
  walking_core_center jsonb,
  nearby_feature      text
);

-- ── felt_surveys (PER-USER) ─────────────────────────────────────────────────
create table if not exists travel.felt_surveys (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references travel.cities (id) on delete cascade,
  user_id    uuid not null references travel.profiles (id) on delete cascade,
  setting    integer, aliveness integer, fabric integer, realness integer, january integer,
  slovenia   integer,
  note       text,
  context    text,
  taken_at   date,
  updated_at timestamptz not null default now(),
  unique (city_id, user_id)
);

-- ── journal_entries (PER-USER) ──────────────────────────────────────────────
create table if not exists travel.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references travel.cities (id) on delete cascade,
  user_id    uuid not null references travel.profiles (id) on delete cascade,
  body       text not null default ''::text,
  reaction   text,
  at_place   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists journal_entries_city_user_idx
  on travel.journal_entries (city_id, user_id, created_at desc);

-- ── baseline_ratings (PER-USER) ─────────────────────────────────────────────
create table if not exists travel.baseline_ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references travel.profiles (id) on delete cascade,
  place_name text not null,
  setting    integer, aliveness integer, fabric integer, realness integer, january integer,
  slovenia   integer,
  note       text,
  context    text default 'memory'::text,
  taken_at   date,
  updated_at timestamptz not null default now(),
  unique (user_id, place_name)
);

-- ── user_weights (PER-USER) ─────────────────────────────────────────────────
create table if not exists travel.user_weights (
  user_id uuid primary key references travel.profiles (id) on delete cascade,
  weights jsonb not null default '{}'::jsonb
);

-- ── trips (PER-USER) ────────────────────────────────────────────────────────
create table if not exists travel.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references travel.profiles (id) on delete cascade,
  name        text not null,
  theme       text,
  start_date  date,
  end_date    date,
  glance      jsonb default '{}'::jsonb,
  pre_trip    jsonb default '{}'::jsonb,
  legs        jsonb default '[]'::jsonb,
  options     jsonb default '{}'::jsonb,
  entries     jsonb default '[]'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  travelers   jsonb not null default '[]'::jsonb,
  passes      jsonb not null default '[]'::jsonb,
  regions     jsonb not null default '[]'::jsonb
);

-- ── trip_entries (one row per entry) ────────────────────────────────────────
create table if not exists travel.trip_entries (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references travel.trips (id) on delete cascade,
  day        date,
  payload    jsonb not null default '{}'::jsonb,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_entries_trip_day_idx on travel.trip_entries (trip_id, day);

-- ── trip_fork_comments (PER-FORK, SHARED) ───────────────────────────────────
create table if not exists travel.trip_fork_comments (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references travel.trips (id) on delete cascade,
  fork_id    text not null,
  choice_id  text,
  author_id  uuid not null references travel.profiles (id) on delete cascade,
  body       text not null default ''::text,
  lean       text check (lean in ('up', 'down') or lean is null),
  created_at timestamptz not null default now(),
  constraint trip_fork_comments_body_nonempty check (body <> '')
);
create index if not exists trip_fork_comments_trip_fork_idx
  on travel.trip_fork_comments (trip_id, fork_id, created_at asc);

-- ── pois (SHARED, cached) ───────────────────────────────────────────────────
create table if not exists travel.pois (
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
  source            text not null default 'google_places'::text,
  fetched_at        timestamptz not null default now(),
  attributes            jsonb,
  attributes_fetched_at timestamptz
);
create index if not exists pois_lat_lon_idx on travel.pois (lat, lon);
create index if not exists pois_primary_type_idx on travel.pois (primary_type);

-- ── walkthrough_feedback (Janice's deck notes) ──────────────────────────────
create table if not exists travel.walkthrough_feedback (
  id         uuid primary key default gen_random_uuid(),
  slide      integer not null,
  phase      text not null default ''::text,
  note       text not null,
  ua         text not null default ''::text,
  created_at timestamptz not null default now()
);

-- ── nominatim_cache (SHARED, cached) ────────────────────────────────────────
create table if not exists travel.nominatim_cache (
  endpoint    text not null,
  query       text not null,
  params      jsonb not null,
  result      jsonb,
  http_status integer,
  fetched_at  timestamptz not null default now(),
  primary key (endpoint, query, params)
);

-- ── external_cache (SHARED, cached) ─────────────────────────────────────────
create table if not exists travel.external_cache (
  source      text not null,
  query       text not null,
  result      jsonb,
  http_status integer,
  fetched_at  timestamptz not null default now(),
  primary key (source, query)
);
