-- 0017 — trips: travelers + passes columns. The v2 model adds two trip-level
-- structures the trips table doesn't have yet (issue #9, see
-- features/trip-planner-components.md §3, §4.3):
--
--   travelers[] = { name, kind: person|pet, chips: [veg|dog|kid|…] }
--     One structured row per traveler, each carrying its own restriction chips.
--     The trip's active marker set is the UNION of those chips: a pet row is
--     *why* 🐾 lights up; Slovenia has no dog row, so 🐾 hides everywhere
--     (data kept, "show all" escape hatch). No separate diet field — it derives.
--
--   passes[] = { id, name, cost, covers? }
--     A pass is bought once (an `errand` entry) and referenced by entries via
--     `coveredBy` so cash/cost rollups don't double-count (Ljubljana City Card,
--     Julian Alps Card, Venice day-visitor).
--
-- Deliberately NO new columns for two adjacent structures:
--   • Accommodations stay PER-LEG inside `legs jsonb` (leg.candidates[] +
--     leg.chosenId) — lodging is a property of a leg, not the trip frame.
--   • Reservations stay DERIVED from entries (the booking spine: status in
--     reserved|booked, or a booking.cancelBy) — never a stored table.
-- Documented here so no one adds redundant columns later.
--
-- Run by hand in the Supabase SQL editor (no CLI); idempotent.

alter table trips add column if not exists travelers jsonb default '[]'::jsonb;
alter table trips add column if not exists passes    jsonb default '[]'::jsonb;
