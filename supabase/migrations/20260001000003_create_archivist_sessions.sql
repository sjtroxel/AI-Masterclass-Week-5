-- Migration: create archivist_sessions table
-- Phase 1.5 — stores The Archivist's conversation state; TTL of 24 hours
-- Cleanup job (supabase edge function) deletes rows WHERE expires_at < now()

CREATE TABLE archivist_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT UNIQUE NOT NULL,           -- matches session_id in poster_search_events
  messages        JSONB NOT NULL DEFAULT '[]',    -- array of {role, content, citations, timestamp, confidence, handoff_suggested}
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

CREATE INDEX archivist_sessions_expires_at_idx  ON archivist_sessions (expires_at);   -- for cleanup job
CREATE INDEX archivist_sessions_session_id_idx  ON archivist_sessions (session_id);
