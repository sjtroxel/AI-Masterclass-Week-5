# Poster Pilot — Data Schema

All tables live in the `public` schema in Supabase (PostgreSQL 15 + pgvector extension).

---

## Table: `posters`

The primary catalog table. One row per ingested poster record.

```sql
CREATE TABLE posters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- External record identifier. Stores the original NARA NAID when available
  -- (extracted from DPLA metadata), otherwise "dpla-{id}" for non-NARA sources.
  nara_id               TEXT UNIQUE NOT NULL,
  title                 TEXT NOT NULL,
  date_created          TEXT,                        -- free-form dates ("ca. 1941-1943")
  date_normalized       DATE,                        -- best-effort parsed date for filtering
  creator               TEXT,                        -- artist, agency, or "Unknown"
  description           TEXT,                        -- catalog description
  subject_tags          TEXT[],                      -- subject headings (array)
  series_title          TEXT,                        -- e.g., "WPA Posters", "NASA History"
  series_id             UUID REFERENCES series(id),
  physical_description  TEXT,                        -- medium, dimensions
  reproduction_number   TEXT,                        -- NARA's internal reference
  rights_statement      TEXT,                        -- copyright / access status
  image_url             TEXT NOT NULL,               -- full-resolution image URL (DPLA hasView or object)
  thumbnail_url         TEXT NOT NULL,               -- thumbnail (DPLA object field, or image_url fallback)

  -- AI-generated fields
  embedding             vector(768),                 -- CLIP image embedding (clip-vit-large-patch14)
  embedding_confidence  FLOAT4 NOT NULL DEFAULT 0,  -- cosine similarity to series centroid
  metadata_completeness FLOAT4 NOT NULL DEFAULT 0,  -- ratio of non-null required fields
  overall_confidence    FLOAT4 NOT NULL DEFAULT 0,  -- (embedding_conf * 0.7) + (meta_comp * 0.3)

  -- Ingest tracking
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingest_version        INT NOT NULL DEFAULT 1,      -- incremented on re-ingest

  CONSTRAINT embedding_confidence_range CHECK (embedding_confidence BETWEEN 0 AND 1),
  CONSTRAINT metadata_completeness_range CHECK (metadata_completeness BETWEEN 0 AND 1),
  CONSTRAINT overall_confidence_range CHECK (overall_confidence BETWEEN 0 AND 1)
);

-- Index for vector similarity search
CREATE INDEX ON posters USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Index for series filtering
CREATE INDEX ON posters (series_id);
-- Index for date range queries
CREATE INDEX ON posters (date_normalized);
-- Index for confidence-based filtering
CREATE INDEX ON posters (overall_confidence);
```

### Confidence Score Logic
- `embedding_confidence`: CLIP cosine similarity between this poster's image embedding
  and the precomputed centroid for its series. High score = visually representative
  of its series; low score = outlier or poor image quality.
- `metadata_completeness`: `filled_fields / 6` where required fields are:
  `title`, `date_created`, `creator`, `description`, `nara_id`, `series_title`.
  (`nara_id` is always populated — either a real NARA NAID or a `dpla-{id}` fallback.)
- `overall_confidence`: `(embedding_confidence * 0.7) + (metadata_completeness * 0.3)`

---

## Table: `series`

Defines the major thematic groupings of the poster corpus.

```sql
CREATE TABLE series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,          -- e.g., 'wpa-posters', 'nasa-history'
  title           TEXT NOT NULL,                 -- e.g., 'WPA Posters'
  description     TEXT,
  nara_series_ref TEXT,                          -- original NARA series identifier (legacy; DPLA is now the ingest source)
  centroid        vector(768),                   -- mean embedding of all posters in series
  poster_count    INT NOT NULL DEFAULT 0,        -- updated by trigger
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Table: `poster_search_events`

Audit log for every search query. Powers the Human Handoff reporting and future analytics.

```sql
CREATE TABLE poster_search_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              TEXT NOT NULL,          -- anonymous session identifier (client-generated)
  query_text              TEXT,                   -- null for image-to-image searches
  query_mode              TEXT NOT NULL,          -- 'text' | 'image' | 'hybrid' | 'vibe'
  query_embedding         vector(768),            -- the query's CLIP embedding (stored for analysis)

  -- Results
  result_poster_ids       UUID[],                 -- ordered list of returned poster IDs
  top_similarity_score    FLOAT4,                 -- highest cosine similarity in result set
  min_similarity_score    FLOAT4,                 -- lowest cosine similarity in result set
  result_count            INT NOT NULL DEFAULT 0,

  -- Human Handoff tracking
  human_handoff_needed    BOOLEAN NOT NULL DEFAULT FALSE,
  human_handoff_triggered BOOLEAN NOT NULL DEFAULT FALSE, -- user actually clicked The Red Button
  handoff_reason          TEXT,                   -- 'low_similarity' | 'low_confidence' | 'archivist_uncertain'
  handoff_threshold_used  FLOAT4 NOT NULL DEFAULT 0.72,

  -- Metadata
  latency_ms              INT,                    -- total request processing time
  clip_latency_ms         INT,                    -- time spent generating embedding
  db_latency_ms           INT,                    -- time spent in Supabase query
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT query_mode_values CHECK (query_mode IN ('text', 'image', 'hybrid', 'vibe'))
);

-- Index for reporting queries
CREATE INDEX ON poster_search_events (created_at DESC);
CREATE INDEX ON poster_search_events (human_handoff_triggered) WHERE human_handoff_triggered = TRUE;
CREATE INDEX ON poster_search_events (session_id);
```

---

## Table: `archivist_sessions`

Stores The Archivist's conversation state. One session per user browser session.

```sql
CREATE TABLE archivist_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT UNIQUE NOT NULL,           -- matches session_id in poster_search_events
  messages        JSONB NOT NULL DEFAULT '[]',    -- array of {role, content, citations, timestamp}
  poster_context  UUID[],                         -- poster IDs currently "in context"
  turn_count      INT NOT NULL DEFAULT 0,
  total_tokens    INT NOT NULL DEFAULT 0,         -- cumulative token usage for budget tracking

  -- Handoff tracking
  archivist_expressed_uncertainty BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_prompted_at TIMESTAMPTZ,               -- when the Red Button was shown due to AI uncertainty

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

-- JSONB message structure (for reference — not enforced by DB):
-- {
--   "role": "user" | "assistant",
--   "content": "string",
--   "citations": [{ "nara_id": "string", "field": "string", "value": "string" }],
--   "timestamp": "ISO8601",
--   "confidence": 0.0 - 1.0,       -- Archivist's self-assessed confidence (parsed from response)
--   "handoff_suggested": boolean
-- }

CREATE INDEX ON archivist_sessions (expires_at);  -- for cleanup job
CREATE INDEX ON archivist_sessions (session_id);
```

---

## Supabase RPC Functions

### `match_posters` — Vector similarity search
```sql
CREATE OR REPLACE FUNCTION match_posters(
  query_embedding   vector(768),
  match_threshold   FLOAT4 DEFAULT 0.72,
  match_count       INT DEFAULT 20,
  series_filter     TEXT DEFAULT NULL      -- optional series slug filter
)
RETURNS TABLE (
  id                UUID,
  nara_id           TEXT,
  title             TEXT,
  date_created      TEXT,
  creator           TEXT,
  thumbnail_url     TEXT,
  series_title      TEXT,
  overall_confidence FLOAT4,
  similarity_score  FLOAT4
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.nara_id,
    p.title,
    p.date_created,
    p.creator,
    p.thumbnail_url,
    p.series_title,
    p.overall_confidence,
    1 - (p.embedding <=> query_embedding) AS similarity_score
  FROM posters p
  LEFT JOIN series s ON p.series_id = s.id
  WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    AND (series_filter IS NULL OR s.slug = series_filter)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### `get_visual_siblings` — Visual similarity for a known poster
```sql
CREATE OR REPLACE FUNCTION get_visual_siblings(
  source_poster_id  UUID,
  sibling_count     INT DEFAULT 5
)
RETURNS TABLE (
  id               UUID,
  nara_id          TEXT,
  title            TEXT,
  thumbnail_url    TEXT,
  similarity_score FLOAT4
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_embedding vector(768);
BEGIN
  SELECT embedding INTO source_embedding FROM posters WHERE id = source_poster_id;

  RETURN QUERY
  SELECT
    p.id,
    p.nara_id,
    p.title,
    p.thumbnail_url,
    1 - (p.embedding <=> source_embedding) AS similarity_score
  FROM posters p
  WHERE p.id != source_poster_id
  ORDER BY p.embedding <=> source_embedding
  LIMIT sibling_count;
END;
$$;
```

---

## Row Level Security Policies

```sql
-- posters: public read, service-role write
ALTER TABLE posters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public posters are readable by everyone"
  ON posters FOR SELECT USING (true);
CREATE POLICY "Only service role can insert/update posters"
  ON posters FOR ALL USING (auth.role() = 'service_role');

-- poster_search_events: service-role only
ALTER TABLE poster_search_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access search events"
  ON poster_search_events FOR ALL USING (auth.role() = 'service_role');

-- archivist_sessions: service-role only
ALTER TABLE archivist_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can access archivist sessions"
  ON archivist_sessions FOR ALL USING (auth.role() = 'service_role');
```

---

## Data Retention & Cleanup

- `archivist_sessions` expire after 24 hours. A scheduled Supabase Edge Function
  (`cleanup-expired-sessions`) runs nightly to `DELETE WHERE expires_at < now()`.
- `poster_search_events` are retained indefinitely for analytics. Archive to cold
  storage after 90 days (future implementation).
- `query_embedding` on `poster_search_events` is stored for potential relevance
  feedback and search quality analysis — it is NOT exposed via the API.
