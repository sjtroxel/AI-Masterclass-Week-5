# Phase 5 — Archivist (RAG) API

**Status**: ✅ Complete — 194 tests passing (29 new in this phase), typecheck clean.

**Depends on**: [Phase 4 — Search API](./phase-4-search-api.md)
  (the Archivist fetches poster metadata from the same data layer)
**Next phase**: [Phase 9 — Archivist Sidebar UI](./phase-9-archivist-ui.md)
  (cannot begin until this phase is complete)

---

## Definition of Done

- `POST /api/chat` streams a response via Server-Sent Events (SSE)
- Each SSE delta event has shape: `{ delta: string }`
- Final SSE event has shape: `{ done: true, citations: Citation[], confidence: number }`
- Session history is loaded from `archivist_sessions` on every request and persisted after
- Context block includes max 5 posters; the `embedding` column is never fetched
- Token budget stays under 8,000; history is summarized (not truncated) when approaching limit
- When any retrieved poster has `similarity_score < 0.72`, the confidence clause is appended
  to the system prompt
- Model is called with exactly `temperature: 0.2` and `max_tokens: 900`
- Sessions with `expires_at < now()` are rejected; a new session starts transparently
- The Anthropic API is never called from any route file — only from `archivistService.ts`

---

## Small Bits

### 5.1 — `server/services/archivistService.ts` — context assembly
- `buildContextBlock(posterIds: string[]): Promise<string>` — fetches up to 5 posters
  (explicit column list: `id`, `nara_id`, `title`, `creator`, `date_created`, `series_title`,
  `description`, `subject_tags`, `physical_description`, `overall_confidence` — no `embedding`)
- Formats each poster as XML per the template in `RAG_STRATEGY.md`:
  ```xml
  <poster nara_id="{nara_id}" similarity_score="{score:.3f}">
    <title>{title}</title>
    ...
  </poster>
  ```
- `assembleSystemPrompt(contextBlock: string, lowConfidence: boolean): string` — injects
  context into the production system prompt from `RAG_STRATEGY.md`; appends the confidence
  clause when `lowConfidence` is true

### 5.2 — `server/services/archivistService.ts` — session management
- `loadSession(sessionId: string): Promise<ArchivistSession>` — fetches from `archivist_sessions`;
  returns an empty new session if not found; throws `ValidationError` if session is expired
- `saveSession(session: ArchivistSession): Promise<void>` — upserts to `archivist_sessions`;
  updates `updated_at`, increments `turn_count`, accumulates `total_tokens`

### 5.3 — `server/services/archivistService.ts` — token budget management
- `estimateTokens(text: string): number` — rough estimate: `Math.ceil(text.length / 4)`
- `isApproachingBudget(session: ArchivistSession, contextTokens: number): boolean` —
  returns true when `system + context + history + response buffer > 8,000 tokens`
- `compressHistory(session: ArchivistSession): Promise<ArchivistSession>` — summarizes the
  oldest 4 message pairs via a Claude call using the summarization prompt from `RAG_STRATEGY.md`;
  preserves the 2 most recent message pairs verbatim; returns updated session

### 5.4 — `server/services/archivistService.ts` — streaming Anthropic call
- `streamResponse(params: ArchivistParams, res: Response): Promise<void>`
- Assembles: system prompt + context block + session history + current user message
- Calls `anthropic.messages.stream()` with:
  - `model: 'claude-sonnet-4-6'`
  - `temperature: 0.2`
  - `max_tokens: 900`
- Pipes each text delta to SSE: `res.write('data: ' + JSON.stringify({ delta }) + '\n\n')`
- On stream complete: extract citations, save session, send final event:
  `res.write('data: ' + JSON.stringify({ done: true, citations, confidence }) + '\n\n')`
- On stream error: send SSE error event, call `next(err)`

### 5.5 — `server/routes/chat.ts`
- `POST /api/chat` — Zod validates:
  - `message: string` (max 2000 chars)
  - `session_id: string` (UUID format)
  - `poster_context_ids: string[]` (max 5 items, each a valid UUID)
- Sets SSE response headers:
  `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Calls `archivistService.streamResponse()` — the route has zero business logic

### 5.6 — Citation extraction
- `extractCitations(text: string, context: ArchivistContext): Citation[]`
- Parses NARA record references (e.g., `[WPA-1942-003]`) from the assistant response text
- Returns `{ nara_id: string, field: string, value: string }[]`
- Gracefully returns `[]` if no citations found

Unit tests — `server/services/__tests__/archivistService.test.ts` (all mocked):
- Zero citations in text → returns `[]`
- One citation → returns single-item array with correct `nara_id`
- Multiple citations → returns array with no duplicates

### 5.7 — Integration tests for Archivist (all mocked)
- Test: session is created on first call, persisted via upsert with `turn_count: 1`
- Test: history compression fires when estimated token budget approaches 8,000
- Test: confidence clause is present in system prompt when any poster has `similarity_score < 0.72`
- Test: `temperature: 0.2` and `max_tokens: 900` are always passed to the Anthropic SDK (asserted on mock call args)
- Test: expired session throws `ValidationError` without writing any SSE events
- Test: mid-stream error (after headers flushed) emits an SSE error event and calls `next(err)`

**Implementation notes**:
- `buildContextBlock` accepts an optional `similarityScores: Record<string, number>` param
  (not in original spec but required for the XML template's `similarity_score` attribute).
- `compressHistory` stores the summary as `role: 'user'` to satisfy the Anthropic API's
  requirement that message arrays start with 'user'. If the stored first message is 'assistant',
  `streamResponse` prepends a synthetic `'[Continuing our conversation]'` user message.
- Citation extraction scans response text for `nara_id` values from retrieved poster context
  (no bracket notation required — model is not instructed to use special citation syntax).
- Mock isolation: `streamResponse` tests use `mockReset()` on each shared mock in `beforeEach`
  (not just `clearAllMocks()`) to drain `mockReturnValueOnce` queues between tests.

---

## Testing Checkpoint

- ✅ All 29 Archivist service unit/integration tests pass (zero real API calls — fully mocked)
- ✅ `npm test` — 194 total tests, all passing; `npm run typecheck` — clean
- Manual SSE test: `curl -N -X POST localhost:3001/api/chat -H "Content-Type: application/json" \`
  `-d '{"message":"Tell me about WPA posters.", "session_id":"<uuid>", "poster_context_ids":[]}'`
  → streams delta events word-by-word; final event: `{"done":true,"citations":[],"confidence":0.85}`
- After the curl test, verify an `archivist_sessions` row exists in Supabase with `turn_count: 1`
