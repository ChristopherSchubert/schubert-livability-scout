-- 0014 — poi attributes: the cited-marker fields from Google Places (New)
-- Place Details that the original searchNearby FIELD_MASK didn't capture
-- (features/trip-planner-systems.md §2). One jsonb blob per POI, exactly as
-- Google returns it, plus a fetch timestamp so every derived marker can carry
-- "Google Places · fetched <date>" as its citation.
--
--   attributes = { allowsDogs, servesVegetarianFood, goodForChildren,
--                  outdoorSeating, accessibilityOptions{}, paymentOptions{},
--                  regularOpeningHours{ weekdayDescriptions[] } }
--
-- Fields absent from the blob were not provided by Google for that place —
-- the marker stays null ("not verified"), never guessed. Fetched on demand per
-- trip leg by scripts/fetch-poi-attributes.mjs, not for the whole cache.
alter table pois add column if not exists attributes jsonb;
alter table pois add column if not exists attributes_fetched_at timestamptz;
