-- 0010 — poi_positions: cached per-city POI lat/lons for the walking-core
-- chapter on the city detail page.
--
-- The walking-core measurement (cafe_score, bar_score, rest_score,
-- daily_needs_score) is a weighted sum of POIs out to 1500 m, with weights
-- following a 500 m plateau and 400 m exponential decay. The map needs to
-- render each contributing POI as a dot whose opacity == w(d), and the
-- breakdown panel needs to count "N in plateau · M beyond". Both of those
-- require positions, not just sums.
--
-- Rather than re-query Places at page-load time (cost + latency), the
-- walking-core measurer caches the trimmed positions here when it computes
-- the scores. Same idea as `block_geometries` — store the rendered shape so
-- the client can draw it without re-doing the work.
--
-- Shape: array of { lat, lon, category, weight }, where `category` is one of
-- {cafe, bar, rest, daily} and `weight` is the precomputed w(d) value.
--
-- "Supabase is the source of truth" — this column is written ONLY by the
-- walking-core measurer (or onboarding); never hand-edited.

alter table cities
  add column if not exists poi_positions jsonb default '[]';
