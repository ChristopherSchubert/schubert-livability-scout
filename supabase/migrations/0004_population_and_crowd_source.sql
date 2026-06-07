-- 0004 — population_total + crowd_season_source.
--
-- Adds the city-wide population (Census ACS Place B01003_001E) that the
-- crowd-season normalization needs as its denominator. Tract-level pop is
-- already extracted by the census measurer but is the wrong unit — Pittsburgh
-- tract = 5k people, but Pittsburgh-the-city = 302k. Per-capita tourism math
-- only works against the city-wide number.
--
-- crowd_season_source captures the method version + anchors so the same
-- ruler is identifiable across runs (the project's identical-ruler rule).

alter table cities add column if not exists population_total    integer;
alter table cities add column if not exists population_source   text;
alter table cities add column if not exists crowd_season_source text;
