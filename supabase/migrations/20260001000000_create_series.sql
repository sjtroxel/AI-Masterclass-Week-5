-- Migration: create series table
-- Phase 1.2 — series is created first because posters.series_id references it.
-- Requires: pgvector extension enabled (Phase 1.1)

CREATE TABLE series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,          -- e.g., 'wpa-posters', 'nasa-history'
  title           TEXT NOT NULL,                 -- e.g., 'WPA Posters'
  description     TEXT,
  nara_series_ref TEXT,                          -- NARA's series identifier
  centroid        vector(768),                   -- mean embedding of all posters in series; NULL until posters are ingested
  poster_count    INT NOT NULL DEFAULT 0,        -- updated by trigger (Phase 3)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
