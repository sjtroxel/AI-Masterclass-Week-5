-- Migration: create poster_search_events table
-- Phase 1.4 — audit log for every search query; powers Human Handoff reporting
-- No FK to posters: result_poster_ids is a UUID[] to avoid cascading deletes on audit data

CREATE TABLE poster_search_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              TEXT NOT NULL,          -- anonymous session identifier (client-generated)
  query_text              TEXT,                   -- NULL for image-to-image searches
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

  -- Performance telemetry
  latency_ms              INT,                    -- total request processing time
  clip_latency_ms         INT,                    -- time spent generating embedding
  db_latency_ms           INT,                    -- time spent in Supabase query

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT query_mode_values CHECK (query_mode IN ('text', 'image', 'hybrid', 'vibe'))
);

CREATE INDEX poster_search_events_created_at_idx  ON poster_search_events (created_at DESC);
CREATE INDEX poster_search_events_handoff_idx      ON poster_search_events (human_handoff_triggered) WHERE human_handoff_triggered = TRUE;
CREATE INDEX poster_search_events_session_id_idx   ON poster_search_events (session_id);
