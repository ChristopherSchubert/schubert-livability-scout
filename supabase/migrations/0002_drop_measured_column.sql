-- Drop cities.measured (the cached composite score).
--
-- The composite is recomputed live at render time by weightedAxisScore in
-- lib/planner-data.js, reading from measured_metrics. Storing a scalar
-- alongside meant any backfill that updated a single metric had to also
-- remember to refresh the cached scalar (the registry runner didn't, so the
-- scalar drifted). Better to have no cache than a stale one.
--
-- /api/measure still RETURNS a computed composite in its response for the
-- "Saved & re-measured — composite X" toast in MapPicker.jsx; it just no
-- longer persists it. Run once in the Supabase SQL editor.

alter table cities drop column if exists measured;
