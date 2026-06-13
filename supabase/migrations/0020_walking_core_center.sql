-- 0020 — walking_core_center: the adaptive measurement center the walking-core
-- measurer slides to (the densest social-POI cluster inside the stay zone). The
-- saved pin (cities.lat/lon) does NOT move; this is only WHERE the plateau-decay
-- score was taken, so the chapter map can draw the core circle there instead of
-- at an off-center pin (#1). Shape: { lat, lon, moved } (moved = metres from the
-- pin). Null until the measurer runs; null ⇒ the map falls back to the pin.
alter table cities add column if not exists walking_core_center jsonb;
