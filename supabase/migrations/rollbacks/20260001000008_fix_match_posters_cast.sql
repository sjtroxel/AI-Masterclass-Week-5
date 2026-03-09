-- Rollback: restore match_posters without explicit FLOAT4 cast
-- Only applies to pgvector versions where <=> returns float4 natively.

CREATE OR REPLACE FUNCTION match_posters(
  query_embedding   vector(768),
  match_threshold   FLOAT4 DEFAULT 0.72,
  match_count       INT DEFAULT 20,
  series_filter     TEXT DEFAULT NULL
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
