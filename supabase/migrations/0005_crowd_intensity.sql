-- 0005 — crowd_intensity scalar.
--
-- Splits the two concerns the v1 crowd_season conflated:
--   crowd_season    = within-city monthly SHAPE (when do crowds peak?)
--   crowd_intensity = cross-city tourist-saturation MAGNITUDE (how
--                     dominated by tourists is this city overall?)
--
-- The shape uses within-city min-max scaling so seasonality is always
-- visible, even in cities with modest absolute intensity. The intensity
-- uses log-scaled per-capita peak against fixed anchors so Pittsburgh
-- and Bar Harbor end up on the same comparable 0-5 axis.

alter table cities add column if not exists crowd_intensity int;
