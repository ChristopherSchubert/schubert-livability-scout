-- Adds drive_hrs_from_pit to cities (text: number-string | 'FLY' | null) and
-- backfills the known set. Run once in the Supabase SQL editor.
alter table cities add column if not exists drive_hrs_from_pit text;

update cities set drive_hrs_from_pit = v.val
from (values
  ('Annapolis, MD',           '4.5'),
  ('Savannah, GA',             '11'),
  ('Charleston, SC',           '10.5'),
  ('Greenville, SC',           '9'),
  ('Charlottesville, VA',      '5.5'),
  ('Old Town Alexandria, VA',  '4'),
  ('Lewes, DE',                '5.5'),
  ('New Castle, DE',           '5'),
  ('Mystic, CT',               '7.5'),
  ('Litchfield, CT',           '7'),
  ('Essex, CT',                '7.5'),
  ('Newport, RI',              '9.5'),
  ('Bristol, RI',              '9.5'),
  ('Northampton, MA',          '8.5'),
  ('Santa Barbara, CA',        'FLY'),
  ('San Luis Obispo, CA',      'FLY'),
  ('Santa Cruz, CA',           'FLY'),
  ('Bellingham, WA',           'FLY')
) as v(name, val)
where cities.name = v.name
  and cities.drive_hrs_from_pit is distinct from v.val;
