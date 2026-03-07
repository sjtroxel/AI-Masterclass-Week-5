-- Rollback: drop series table
-- NOTE: run posters rollback first if posters table exists (it references series.id)

DROP TABLE IF EXISTS series;
