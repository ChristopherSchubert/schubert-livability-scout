-- 0006 — nps_unit_code: the National Park Service unit whose monthly
-- recreation-visit seasonality stands in for a town's tourist presence.
--
-- Set ONLY for towns where the unit's visitors are demonstrably the town's
-- tourists on the same trip (an in-town or immediately-adjacent attraction),
-- so the NPS curve is a faithful proxy. This is the top tier of the
-- crowd_season cascade: where present, NPS ground-truth monthly visits
-- override the Google-Trends / Wikipedia signals. Provenance (the chosen
-- unit) lives here on the row, not in a runtime code literal.
alter table cities add column if not exists nps_unit_code text;
