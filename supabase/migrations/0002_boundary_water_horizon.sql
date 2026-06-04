-- Backfills the six columns on `cities` that were added in the SQL editor
-- during the adaptive-measurement / boundary work but never round-tripped
-- into schema.sql. Idempotent — safe to re-run on the live DB.
--
--   is_calibration     — cohort flag for baseline places (hidden in Calibrate
--                        / FunnelBoard when the toggle is on).
--   water_target       — user-picked water body { name, point, … } that drives
--                        the water_dist_m metric (see app/api/measure POST { water:true }).
--   stay_zone_boundary — GeoJSON polygon for the adaptive measurement field.
--   boundary_source    — provenance of stay_zone_boundary (Census Place,
--                        OSM polygon, NRHP district, point-circle, …).
--   boundary_set_at    — when the boundary was last fetched; lets callers
--                        detect "measurement stale vs boundary."
--   horizon_features   — { peaks: [{ name, angle, dir, … }], occupancyPct }
--                        from measureHorizonPeaks, rendered under
--                        mtn_horizon_pct on the city detail page.

alter table cities add column if not exists is_calibration     boolean not null default false;
alter table cities add column if not exists water_target       jsonb;
alter table cities add column if not exists stay_zone_boundary jsonb;
alter table cities add column if not exists boundary_source    text;
alter table cities add column if not exists boundary_set_at    date;
alter table cities add column if not exists horizon_features   jsonb;
