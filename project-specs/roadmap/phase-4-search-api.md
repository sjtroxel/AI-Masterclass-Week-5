# Phase 4 — Search API

**Depends on**: [Phase 3 — Ingestion Pipeline](./phase-3-ingestion.md)
  (real poster data with embeddings must be in Supabase to test against)
**Next phase**: [Phase 5 — Archivist API](./phase-5-archivist-api.md)
  and [Phase 6 — Frontend Shell](./phase-6-frontend-shell.md) (can begin in parallel after this phase)

---

## Definition of Done

- `POST /api/search` with mode `text` returns `PosterResult[]` with `similarity_score` on every result
- `POST /api/search` with mode `image` accepts base64 or HTTPS URL; returns results
- `POST /api/search` with mode `hybrid` applies Reciprocal Rank Fusion (60% visual / 40% text)
- `POST /api/search` with mode `vibe` calls Claude for query expansion, then RRF-merges results
- `handoff_needed: true` is returned whenever ANY result has `similarity_score < 0.72`
- Every search is logged to `poster_search_events` (async, non-blocking — never delays response)
- `GET /api/posters/:id` returns full poster detail (no `embedding` column)
- `GET /api/series/:slug` returns series metadata + paginated poster list
- `GET /api/posters/:id/siblings` returns Visual Siblings via `get_visual_siblings` RPC
- Input is Zod-validated; queries > 500 chars or images > 5MB rejected with 400
- All service tests are anchored to the spec requirements, not to the implementation

---

## Small Bits

### 4.1 — `server/services/queryAnalyzer.ts`
- `analyzeQuery(query: string): QueryAnalysis` — classifies mode (text vs. vibe), detects
  series intent ("WPA posters of..."), detects date intent ("1940s posters")
- `expandVibeQuery(query: string): Promise<string[]>` — calls Anthropic SDK with the vibe
  expansion prompt from `RAG_STRATEGY.md`; validates output is a JSON string array of 3–5 items
- Throws `AIServiceError` if model returns invalid JSON or empty array

Unit tests (mocked Anthropic) — `server/__tests__/queryAnalyzer.test.ts`:
- Vibe expansion returns a valid 3–5 item string array
- Invalid JSON from model throws `AIServiceError`
- Series intent detected from query text
- Date intent detected from query text

### 4.2 — `server/services/searchService.ts` — text mode
- `textSearch(query: string, seriesFilter?: string): Promise<SearchResponse>`
- Flow: `preprocessText` → `generateTextEmbedding` → `match_posters` RPC →
  result augmentation → handoff flag → async event log
- `handoff_needed` is `true` if ANY result has `similarity_score < 0.72`, or if result set is empty

Integration tests (mocked CLIP + Supabase) — `server/__tests__/searchService.test.ts`:
- Results below threshold → `handoff_needed: true`
- Results all above threshold → `handoff_needed: false`
- Empty result set → `handoff_needed: true`
- `handoff_reason` string is present when `handoff_needed` is true

### 4.3 — `server/services/searchService.ts` — image mode
- `imageSearch(image: string, seriesFilter?: string): Promise<SearchResponse>`
- Accepts base64 data URI or HTTPS URL
- Server-side MIME type validation (not just Content-Type header); rejects files > 5MB
- Generates CLIP image embedding → same RPC + augmentation flow as text mode

### 4.4 — `server/services/searchService.ts` — hybrid and vibe modes
- `hybridSearch(query: string, image: string): Promise<SearchResponse>` — runs text and image
  search independently, merges via Reciprocal Rank Fusion (60% visual weight, 40% text weight)
- `vibeSearch(query: string): Promise<SearchResponse>` — expands query to 3–5 concrete
  descriptions via `queryAnalyzer.expandVibeQuery()`, embeds each, merges via RRF

Unit tests (mocked):
- RRF correctly weights and deduplicates results across both text and image result sets
- Vibe search fires query expansion before embedding

### 4.5 — `server/routes/search.ts`
- `POST /api/search` — Zod validates `{ query?, image?, mode, seriesFilter? }`
- Validation rules: `query` max 500 chars; `image` max 5MB; `mode` must be one of
  `'text' | 'image' | 'hybrid' | 'vibe'`
- Dispatches to the correct `searchService` method based on `mode`
- Returns typed `SearchResponse`
- Zero direct `res.status(500)` calls — all errors go to `next(err)`

### 4.6 — `server/services/posterService.ts` — remaining read methods
- `getById(id: string): Promise<Poster | null>` — explicit column list, no `embedding` column
- `getBySeriesSlug(slug: string, page: number, limit: number): Promise<PosterSummary[]>`
- `getVisualSiblings(posterId: string): Promise<PosterSummary[]>` — calls `get_visual_siblings` RPC

### 4.7 — `server/routes/posters.ts`
- `GET /api/posters/:id` — validates UUID format, calls `posterService.getById()`, 404 if null
- `GET /api/series/:slug` — returns series metadata + paginated posters
- `GET /api/posters/:id/siblings` — returns Visual Siblings

### 4.8 — Search event logging
- `logSearchEvent(event: Partial<SearchEvent>): Promise<void>` in `posterService.ts`
- Called async (fire-and-forget) from `searchService` — never awaited in the request path
- Fields logged: `session_id`, `query_text`, `query_mode`, `result_poster_ids`,
  `top_similarity_score`, `min_similarity_score`, `human_handoff_needed`,
  `latency_ms`, `clip_latency_ms`, `db_latency_ms`

---

## Testing Checkpoint

- All `searchService` and `queryAnalyzer` unit tests pass (all mocked — no live API calls)
- Manual API tests with `curl` or a REST client:
  - Text search returns real posters with `similarity_score` values
  - A nonsense query triggers `handoff_needed: true` with a `handoff_reason`
  - `GET /api/posters/:id` returns full detail (no `embedding` field in response)
  - A fake UUID returns 404
- Verify search event rows appear in `poster_search_events` table after each search
- `npm test` — full suite green; `npm run typecheck` — clean
