-- 0017 — trips.travelers + trips.passes: two trip-level structures the v2
-- model needs as first-class data, not prose. (Epic #7, Phase 0, issue #9.)
--
--   travelers [ { name, kind: "person"|"pet", chips: ["veg","dog","kid",…] } ]
--     The active marker set for the trip is the UNION of travelers' chips; a
--     pet row is *why* 🐾 lights up. Diet derives from chips (no separate field).
--
--   passes [ { id, name, cost, covers? } ]
--     Bought once (as an errand entry); entries reference a pass via
--     `coveredBy: "pass:<id>"` so cash rollups don't double-count.
--
-- NOTE — no columns for accommodations or reservations on purpose:
--   • Accommodations live per-leg inside `legs jsonb` (leg.candidates[] +
--     leg.chosenId), not a trip column.
--   • Reservations are DERIVED from entries (the booking spine), not stored.
-- Don't add redundant columns for those later.
alter table trips add column if not exists travelers jsonb not null default '[]'::jsonb;
alter table trips add column if not exists passes    jsonb not null default '[]'::jsonb;
