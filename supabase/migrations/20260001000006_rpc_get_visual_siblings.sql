-- Migration: get_visual_siblings RPC function
-- Phase 1.8 — finds visually similar posters for a known poster (used on detail page)
-- Returns empty result set if source_poster_id does not exist or has no embedding.

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

  -- If poster not found or has no embedding, return empty result set
  IF source_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nara_id,
    p.title,
    p.thumbnail_url,
    1 - (p.embedding <=> source_embedding) AS similarity_score
  FROM posters p
  WHERE p.id != source_poster_id
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> source_embedding
  LIMIT sibling_count;
END;
$$;
