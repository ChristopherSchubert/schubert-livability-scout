-- 0008 — pois: a local cache/database of social POIs from Google Places.
--
-- OSM POI coverage is too thin to measure social life (it had zero of real,
-- popular businesses — the zero-is-not-null trap). The social-POI signal now
-- comes from Google Places (New); this table is the durable local store so we
-- hit Google exactly once per city and query locally forever after.
--
-- Global (one row per Google place_id), not per-city: a place is queried by
-- lat/lon radius at use time (block clustering, and later the Aliveness
-- metrics), so it serves every city near it. Re-fetch upserts by place_id.
--
-- "Supabase is the source of truth" — this is real data, cited (source =
-- google_places, with fetched_at), never hardcoded. We store derived/factual
-- POI records here; we do NOT mix this into OSM.
--
-- Full Enterprise-tier field set is captured (rating/userRatingCount/types/
-- priceLevel/etc.) because the request is already billed at that tier for
-- addressComponents — so the richer payload is free, and userRatingCount lets
-- the clustering weight a spot by how real/popular it is.

create table if not exists pois (
  place_id          text primary key,        -- Google Places resource id
  name              text,
  lat               double precision not null,
  lon               double precision not null,
  primary_type      text,
  types             text[],
  rating            real,
  user_rating_count integer,
  price_level       text,
  business_status   text,                     -- OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY
  street            text,                      -- addressComponents route (for naming)
  formatted_address text,
  source            text not null default 'google_places',
  fetched_at        timestamptz not null default now()
);

-- bbox prefilter for "POIs near a city pin" lookups (haversine refine in code)
create index if not exists pois_lat_lon_idx on pois (lat, lon);
create index if not exists pois_primary_type_idx on pois (primary_type);
