-- Seed: initial series definitions
-- Run after all migrations (20260001000000 through 20260001000006)
-- These are the four major thematic groupings of the NARA poster corpus.

INSERT INTO series (slug, title, description, nara_series_ref) VALUES
  (
    'wpa-posters',
    'WPA Posters',
    'Posters produced by the Federal Art Project of the Works Progress Administration (1936–1943). Subjects include public health, recreation, travel, theater, and wartime messaging.',
    'ARC-558544'
  ),
  (
    'nasa-history',
    'NASA History',
    'Mission posters, program commemoratives, and promotional artwork produced by NASA from the Mercury era through the Space Shuttle program.',
    'NAID-17490055'
  ),
  (
    'patent-medicine',
    'Patent Medicine Advertisements',
    '19th and early 20th century chromolithograph advertisements for patent medicines, tonics, and health remedies. Part of the NARA Consumer Protection collections.',
    'RG-88'
  ),
  (
    'wwii-propaganda',
    'World War II Propaganda Posters',
    'U.S. Government posters produced during World War II (1941–1945) to support the war effort, promote rationing, encourage enlistment, and boost civilian morale.',
    'ARC-513597'
  )
ON CONFLICT (slug) DO NOTHING;
