# Phase 1 — Shared Types & Database Schema

**Depends on**: [Phase 0 — Foundation](./phase-0-foundation.md)
**Next phase**: [Phase 2 — Server Skeleton](./phase-2-server.md)

---

## Definition of Done

- All tables from `DATA_SCHEMA.md` exist in Supabase with correct columns and constraints
- Both RPC functions (`match_posters`, `get_visual_siblings`) are callable from the Supabase dashboard
- RLS policies verified: anon can SELECT from `posters`; anon cannot read `archivist_sessions`
  or `poster_search_events`
- `shared/` compiles with zero TypeScript errors
- `shared/` types are importable from both `client/` and `server/`

---

## Small Bits

### 1.1 — Create Supabase project
- Provision Supabase project (free tier)
- Enable pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
- Note the project URL and both keys (anon + service role); add to local `.env`

### 1.2 — Migration: `series` table
- Create `supabase/migrations/20260001000000_create_series.sql`
- Create corresponding rollback in `supabase/migrations/rollbacks/`
- Run migration; verify table exists in Supabase dashboard

### 1.3 — Migration: `posters` table
- Create `supabase/migrations/20260001000001_create_posters.sql`
- Include all columns from `DATA_SCHEMA.md`, all three confidence CHECK constraints,
  and all four indexes (IVFFlat on `embedding`, series_id, date_normalized, overall_confidence)
- Run migration; confirm IVFFlat index on `embedding` column appears in dashboard

### 1.4 — Migration: `poster_search_events` table
- Create `supabase/migrations/20260001000002_create_search_events.sql`
- Include `query_mode` CHECK constraint and all three indexes
- Run migration

### 1.5 — Migration: `archivist_sessions` table
- Create `supabase/migrations/20260001000003_create_archivist_sessions.sql`
- Include `expires_at` default (`now() + INTERVAL '24 hours'`) and both indexes
- Run migration

### 1.6 — RLS policies
- Create `supabase/migrations/20260001000004_rls_policies.sql`
- Enable RLS on all four tables
- `posters`: public SELECT, service-role ALL
- `poster_search_events`: service-role ALL only
- `archivist_sessions`: service-role ALL only
- Verify manually: use the anon key to attempt SELECT on `archivist_sessions` → must be rejected

### 1.7 — RPC: `match_posters`
- Create `supabase/migrations/20260001000005_rpc_match_posters.sql`
- Exact function definition from `DATA_SCHEMA.md`
- Test in Supabase SQL editor with a dummy zero-vector embedding — should return 0 rows cleanly

### 1.8 — RPC: `get_visual_siblings`
- Create `supabase/migrations/20260001000006_rpc_get_visual_siblings.sql`
- Test in Supabase SQL editor with a non-existent UUID — should return 0 rows cleanly

### 1.9 — Seed initial series data
- Create `supabase/seeds/series.sql` with 4 rows:
  `wpa-posters`, `nasa-history`, `patent-medicine`, `wwii-propaganda`
- Run seed; verify all 4 rows appear in the dashboard

### 1.10 — Shared TypeScript types
- Create `shared/types.ts` with all domain types:
  `Poster`, `PosterSummary`, `PosterResult`, `Series`, `SearchRequest`, `SearchResponse`,
  `ChatMessage`, `Citation`, `ArchivistResponse`, `SearchEvent`, `HandoffReason`,
  `ConfidenceLevel` (enum: `HIGH | MEDIUM | LOW`)
- Create `shared/constants.ts`:
  `HANDOFF_THRESHOLD = 0.72`, `HIGH_CONFIDENCE = 0.85`, `MAX_RAG_POSTERS = 5`,
  `MAX_TOKENS = 8000`, `ARCHIVIST_TEMPERATURE = 0.2`, `ARCHIVIST_MAX_TOKENS = 900`
- Verify `shared/` compiles clean; import one type in `server/index.ts` to confirm resolution

---

## Testing Checkpoint

- `npm run typecheck` — shared types resolve cleanly from both `client/` and `server/`
- All 4 tables visible in Supabase dashboard with correct schemas and column types
- Manually test RLS: anon key cannot write to `poster_search_events` (expect 403)
- Manually test RLS: anon key cannot SELECT from `archivist_sessions` (expect 0 rows or 403)
- `npm test` — still green (no new automated tests; verification is manual in this phase)
