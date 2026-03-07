# Database Rules — Supabase / pgvector

These rules apply when writing any code that interacts with the Supabase database.

## pgvector Query Pattern
Vector similarity searches MUST use the `match_posters` RPC function — never construct
raw similarity queries inline in service files.

```typescript
// CORRECT — use the RPC wrapper
const { data, error } = await supabase.rpc('match_posters', {
  query_embedding: embeddingArray,
  match_threshold: 0.72,
  match_count: 20,
});

// WRONG — do not write raw SQL outside of migration files
```

WHY: The match threshold of 0.72 is the Human Handoff trigger. It must be centrally
controlled so changes propagate consistently across all search paths.

## Column Selection
- ALWAYS specify columns explicitly. The `embedding` column is a 768-dimension float4[] and
  must NEVER be included in a SELECT unless computing a similarity score.
- Pattern:
  ```typescript
  const { data } = await supabase
    .from('posters')
    .select('id, nara_id, title, date_created, creator, thumbnail_url, confidence_score')
    .eq('id', posterId)
    .single();
  ```

## Human Handoff Metadata
- The `human_handoff_needed` boolean on the `poster_search_events` table is set to `true`
  when `similarity_score < 0.72` OR when `ai_confidence < 0.65`.
- This flag is NEVER set by the frontend — only by `server/services/searchService.ts`.
- When `human_handoff_needed` is true, the response payload must include
  `handoff_reason: string` explaining WHY confidence is low.

## Row Level Security
- All tables have RLS enabled. The anon key can only READ public poster data.
- The service role key (server-only) can write to `poster_search_events` and `archivist_sessions`.
- Never disable RLS in migrations — add policies instead.

## Migrations
- Migration files live in `supabase/migrations/` with timestamp prefix: `YYYYMMDDHHMMSS_description.sql`
- Always write a corresponding rollback in `supabase/migrations/rollbacks/`.
- Never modify an existing migration file — create a new one.

## Confidence Score Rules
- `embedding_confidence`: cosine similarity score from CLIP (0.0 – 1.0)
- `metadata_completeness`: ratio of non-null NARA fields (0.0 – 1.0)
- `overall_confidence`: weighted average: `(embedding_confidence * 0.7) + (metadata_completeness * 0.3)`
- These scores are computed at INGEST time and stored — they are NOT recomputed at query time.
