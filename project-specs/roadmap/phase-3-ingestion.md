# Phase 3 — Ingestion Pipeline

**Depends on**: [Phase 2 — Server Skeleton](./phase-2-server.md)
  (Supabase client, config, and error classes must exist before the worker can use them)
**Next phase**: [Phase 4 — Search API](./phase-4-search-api.md)

---

## Definition of Done

- Running `npm run ingest` successfully fetches at least one series from DPLA and inserts
  rows into the `posters` table
- Embeddings are 768-dimension float4 arrays, verified in Supabase dashboard
- `overall_confidence`, `metadata_completeness`, and `embedding_confidence` are populated
  on every ingested row
- Re-running ingest on the same data updates metadata but does NOT regenerate embeddings
  (deduplication keyed on `nara_id`)
- CLIP text preprocessing is idempotent: same input always produces identical output
- Text truncation at 77 tokens produces a logged warning

---

## Small Bits

### 3.1 — `server/lib/clipPreprocessor.ts`
- `preprocessText(text: string): string` — lowercase, strip punctuation, truncate to 77 tokens;
  log a warning (not error) when truncation occurs
- `buildCompositeText(poster: Partial<Poster>): string` — assembles the composite text
  representation from `RAG_STRATEGY.md`:
  ```
  [TITLE]: ...
  [CREATOR]: ...
  [DATE]: ...
  [SERIES]: ...
  [DESCRIPTION]: ...
  [SUBJECTS]: ...
  [PHYSICAL]: ...
  ```
  Null/undefined fields are silently omitted — no placeholder text

Unit tests — `server/__tests__/clipPreprocessor.test.ts`:
- Punctuation is stripped correctly
- Truncation at 77 tokens fires the warning log
- Same input always produces same output (idempotency assertion)
- Null/undefined fields are omitted from the composite without throwing

### 3.2 — `server/services/clipService.ts`
- `generateTextEmbedding(text: string): Promise<number[]>` — preprocesses, calls Replicate
  CLIP model (`replicate/clip-vit-large-patch14`), returns validated 768-dim array
- `generateImageEmbedding(imageUrl: string): Promise<number[]>` — normalizes to base64
  internally, calls Replicate, returns validated 768-dim array
- Both functions throw `AIServiceError` if the response vector is not exactly 768 dimensions
- Rate limiting: max 5 concurrent Replicate requests via a semaphore

Integration tests (mocked Replicate) — `server/__tests__/clipService.test.ts`:
- Correct payload shape is sent to Replicate
- Returns a valid 768-dim array on success
- Throws `AIServiceError` when the mock returns wrong shape

### 3.3 — `server/services/posterService.ts` (ingest methods only)
- `upsertPoster(data: IngestPosterData): Promise<Poster>` — INSERT or UPDATE by `nara_id`;
  does NOT regenerate embedding if `nara_id` already exists and `image_url` is unchanged
- `updateSeriesCentroid(seriesId: string): Promise<void>` — computes mean of all embeddings
  in the series, writes result to `series.centroid`
- No `SELECT *`; explicit column lists only

### 3.4 — `server/workers/ingestWorker.ts`
Step-by-step per poster record:
1. Fetch from DPLA API (`api.dp.la/v2/items`) using a series-specific query
   (e.g., "WPA poster" for `wpa-posters`). Override with `--dpla-query` CLI flag.
   DPLA aggregates NARA holdings alongside LOC, Smithsonian, and other institutions.
   > **Data source note**: The original target was `catalog.archives.gov/api/v2/` (NARA
   > Catalog API v2), which is currently unreachable. DPLA was adopted as the primary
   > source in Phase 3.5 because it provides equivalent or broader NARA poster coverage.
2. Download image → generate CLIP image embedding via `clipService`
3. Compute `metadata_completeness`: `filled_required_fields / 6`
   (required: `title`, `date_created`, `creator`, `description`, `nara_id`, `series_title`)
4. Compute `embedding_confidence`: cosine similarity of poster embedding to series centroid
5. Compute `overall_confidence`: `(embedding_confidence * 0.7) + (metadata_completeness * 0.3)`
6. Upsert via `posterService.upsertPoster()`

Batch behavior: max 5 concurrent, 1-second delay between batches.
After each series: call `posterService.updateSeriesCentroid()`.

Add to root `package.json`:
```
"ingest": "tsx server/workers/ingestWorker.ts"
```

### 3.5 — Thumbnail logic (DPLA)
- DPLA provides an `object` field containing a thumbnail/preview image URL directly.
- `image_url` = `hasView[0]["@id"]` (full resolution) if present, else `object`.
- `thumbnail_url` = `object` field if present, else falls back to `image_url`.
- Both are stored at ingest time — no server-side resize step needed.
- Store result in `thumbnail_url` column — this is what all UI components use.

### 3.6 — Run initial ingest (WPA Posters series only)
- Target: WPA Posters series only — start small, verify data quality before full ingest
- Command: `npm run ingest -- --series=wpa-posters --limit=10 --random-embeddings`
  (use `--random-embeddings` while Replicate billing credit is unavailable)
- Confirm rows appear in Supabase dashboard with all fields populated
- Spot-check 3–5 rows manually: embedding length = 768, confidence scores in [0.0, 1.0]
- Note: `nara_id` values will be original NARA NAIDs for items DPLA sourced from NARA,
  or `dpla-{hash}` for items from other contributing institutions

---

## Testing Checkpoint

- Unit tests: `clipPreprocessor` tests pass (idempotency, truncation warning, null fields)
- Integration tests (mocked): `clipService` tests pass
- Manual run: `npm run ingest` → check Supabase dashboard for real poster rows
- Spot-check confidence scores: all three fields non-zero and in valid range
- Re-run `npm run ingest` on the same data → row counts unchanged (dedup working)
- `npm test` — full suite green; `npm run typecheck` — clean
