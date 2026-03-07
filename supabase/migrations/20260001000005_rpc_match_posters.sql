-- Migration: match_posters RPC function
-- Phase 1.7 — primary vector similarity search used by server/services/searchService.ts
--
-- match_threshold defaults to 0.72 (HUMAN_HANDOFF_THRESHOLD).
-- Scores below this threshold trigger the Human Handoff (The Red Button).
-- The threshold is centralised here; do NOT hardcode 0.72 elsewhere.

CREATE OR REPLACE FUNCTION match_posters(
  query_embedding   vector(768),
  match_threshold   FLOAT4 DEFAULT 0.72,
  match_count       INT DEFAULT 20,
  series_filter     TEXT DEFAULT NULL      -- optional: filter by series.slug
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
