-- 0006 — Eurostat LAU sidecar for EU realness.
--
-- The realness axis is filled by the `census` measurer (US Census ACS) on US
-- cities. EU cities have no ACS equivalent, so realness lands empty. The
-- `eurostat_lau` measurer fills the most universally-available slice —
-- population density per municipality — for any EU city using Eurostat GISCO
-- LAU data. We persist the full LAU envelope here (population, area, name,
-- GISCO id, density per km²) so chips and the detail page can cite the source
-- without re-querying.

alter table cities add column if not exists eu_lau jsonb;
