-- 0023_trip_regions.sql
-- Region/state chips as a first-class trip attribute (#79). Additive, nullable-
-- safe jsonb array of geographic tags:
--   [{ label, kind: 'state' | 'region', lat, lon, source? }]
-- Powers the cross-trip region/state filter and feeds the Plan-tab suggestion
-- anchor set (legs ∪ chip centers). Idempotent + additive — existing rows get
-- an empty array; existing code that ignores the column is unaffected.
alter table public.trips
  add column if not exists regions jsonb not null default '[]'::jsonb;
