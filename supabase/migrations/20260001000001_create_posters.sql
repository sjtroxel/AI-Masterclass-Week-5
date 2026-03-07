-- Migration: create posters table
-- Phase 1.3 — depends on series table (20260001000000)
-- Requires: pgvector extension enabled (Phase 1.1)

CREATE TABLE posters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nara_id               TEXT UNIQUE NOT NULL,        -- NARA catalog record identifier
  title                 TEXT NOT NULL,
  date_created          TEXT,                        -- NARA uses free-form dates ("ca. 1941-1943")
  date_normalized       DATE,                        -- best-effort parsed date for filtering
  creator               TEXT,                        -- artist, agency, or "Unknown"
  description           TEXT,                        -- NARA's catalog description
  subject_tags          TEXT[],                      -- NARA subject headings (array)
  series_title          TEXT,                        -- denormalized for query convenience
  series_id             UUID REFERENCES series(id),
  physical_description  TEXT,                        -- medium, dimensions
  reproduction_number   TEXT,                        -- NARA's internal reference
  rights_statement      TEXT,                        -- copyright / access status
  image_url             TEXT NOT NULL,               -- full-resolution image URL (NARA CDN)
  thumbnail_url         TEXT NOT NULL,               -- 400px thumbnail (generated at ingest)

  -- AI-generated fields (populated during ingest; default 0 until then)
  embedding             vector(768),                 -- CLIP image embedding (clip-vit-large-patch14)
  embedding_confidence  FLOAT4 NOT NULL DEFAULT 0,  -- cosine similarity to series centroid
  metadata_completeness FLOAT4 NOT NULL DEFAULT 0,  -- ratio of non-null required fields (0.0–1.0)
  overall_confidence    FLOAT4 NOT NULL DEFAULT 0,  -- (embedding_confidence * 0.7) + (metadata_completeness * 0.3)

  -- Ingest tracking
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingest_version        INT NOT NULL DEFAULT 1,      -- incremented on re-ingest

  CONSTRAINT embedding_confidence_range CHECK (embedding_confidence BETWEEN 0 AND 1),
  CONSTRAINT metadata_completeness_range CHECK (metadata_completeness BETWEEN 0 AND 1),
  CONSTRAINT overall_confidence_range CHECK (overall_confidence BETWEEN 0 AND 1)
);

-- Vector similarity search index.
-- IVFFlat with lists=100 requires ~1000+ rows for optimal centroid training.
-- After bulk ingest (Phase 3), run: REINDEX INDEX posters_embedding_idx;
CREATE INDEX posters_embedding_idx ON posters USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Supporting indexes
CREATE INDEX posters_series_id_idx      ON posters (series_id);
CREATE INDEX posters_date_normalized_idx ON posters (date_normalized);
CREATE INDEX posters_overall_confidence_idx ON posters (overall_confidence);
