-- Migration: fix ambiguous "id" column reference in get_visual_siblings
-- PostgreSQL treats RETURNS TABLE column names as OUT parameters (variables in plpgsql scope).
-- This made "id" ambiguous between the OUT param and p.id even with the p. qualifier.
-- Fix: explicit AS aliases on every RETURN QUERY column, and table-qualified WHERE clause.

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
  SELECT p.embedding INTO source_embedding
  FROM posters p
  WHERE p.id = source_poster_id;

  -- If poster not found or has no embedding, return empty result set
  IF source_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id               AS id,
    p.nara_id          AS nara_id,
    p.title            AS title,
    p.thumbnail_url    AS thumbnail_url,
    (1 - (p.embedding <=> source_embedding))::FLOAT4 AS similarity_score
  FROM posters p
  WHERE p.id != source_poster_id
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> source_embedding
  LIMIT sibling_count;
END;
$$;
