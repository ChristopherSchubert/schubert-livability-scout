-- 0011 — block_blurbs: a short "why" line per block, parallel to `blocks`.
--
-- A block card showed only a location string; block_blurbs[i] is a one-sentence
-- reason you'd stand there, grounded in the real Google POIs at that spot
-- (anchors + character) by scripts/.gen-block-blurbs.mjs — never invented. Same
-- parallel-array shape as block_geometries.
alter table cities add column if not exists block_blurbs jsonb default '[]';
