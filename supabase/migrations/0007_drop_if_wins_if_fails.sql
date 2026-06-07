-- Drop the if_wins / if_fails gate columns.
--
-- These were pre-trip "gut gates" the owner wrote before a visit to keep
-- post-trip rationalization from moving the goalposts. In practice they
-- read as project-meta on the city page (the same sin as "you'd be testing"
-- closers in why prose), and most of them just restated paragraph 2 of the
-- why. Dropping the columns and the UI rendering — every city's editorial
-- argument now lives entirely in `why`.

ALTER TABLE cities
  DROP COLUMN IF EXISTS if_wins,
  DROP COLUMN IF EXISTS if_fails;
