-- Rollback: drop match_posters function

DROP FUNCTION IF EXISTS match_posters(vector, float4, int, text);
