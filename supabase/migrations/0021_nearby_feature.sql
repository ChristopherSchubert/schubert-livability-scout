-- 0021 — nearby_feature: a short, curated natural/geographic label for the
-- full-screen walking-core view's headline subtitle (#3) — "Adriatic Sea",
-- "Lake Bled", "Penobscot Bay". Editorial (the owner's voice); null falls back
-- to the region parsed from the city name / stay_zone. Seeded only for places
-- whose defining feature is unambiguous; the rest is a standing curation task.
alter table cities add column if not exists nearby_feature text;
