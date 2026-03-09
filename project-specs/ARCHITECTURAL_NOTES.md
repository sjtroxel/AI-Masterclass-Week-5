# Poster Pilot — Architectural Notes

## System Overview

Poster Pilot is a multimodal Discovery Engine. The primary data flow moves from
DPLA (Digital Public Library of America) through CLIP embedding generation, into
Supabase with pgvector, exposed via a typed Express API, and rendered in a React 19 SPA.

DPLA aggregates NARA's digital poster holdings alongside the Library of Congress,
Smithsonian, and other institutions, providing equal or broader coverage of the
same poster corpus that was originally targeted via the NARA Catalog API.

> **Note on data source migration**: The ingest pipeline originally targeted the
> NARA Catalog API v2 (`catalog.archives.gov/api/v2/`), but that API is currently
> unreachable — CloudFront returns SPA HTML for all `/api/v2/` paths. The pipeline
> was migrated to DPLA in Phase 3.5. The `nara_id` column retains its name but now
> stores either the original NARA NAID (extracted from DPLA metadata when available)
> or a `dpla-{id}` prefixed identifier for items without a traceable NARA record.

---

## Data Flow: Ingestion Pipeline

```
DPLA API (api.dp.la/v2/items)
      │
      │  (1) Fetch poster metadata + image URLs (aggregated from NARA and other institutions)
      ▼
Ingest Worker (server/workers/ingestWorker.ts)
      │
      │  (2) Download image → generate CLIP embedding (768-dim vector)
      │  (3) Compute metadata_completeness score
      │  (4) Compute overall_confidence score
      ▼
Supabase / PostgreSQL + pgvector
      │  → posters table (metadata + embedding)
      └──────────────────────────────────────────────
```

### Ingest Worker Details
- **Step 1 — Fetch**: The DPLA API (`api.dp.la/v2/items`) is queried by series slug.
  Default queries: `wpa-posters` → "WPA poster", `nasa-history` → "NASA poster",
  `patent-medicine` → "patent medicine advertisement", `wwii-propaganda` → "World War II
  propaganda poster". Override with `--dpla-query="..."` CLI flag. Rate limiting: max 5
  concurrent requests, 1-second delay between batches.
- **Step 2 — Embed**: Images are fetched and passed to the CLIP model endpoint.
  Text descriptions (`description`, `title`, and `subject` fields) are also
  embedded separately. The final stored embedding is the IMAGE embedding.
  Text embeddings are used for hybrid search but not stored permanently.
- **Step 3 — Metadata completeness**: Score = `filled_required_fields / total_required_fields`.
  Required fields: `title`, `date_created`, `creator`, `description`, `nara_id`, `series`.
- **Step 4 — Confidence**: `(clip_similarity_to_centroid * 0.7) + (metadata_completeness * 0.3)`.
  The centroid per series is precomputed and stored in the `series` table.
- **Deduplication**: Posters are keyed on `nara_id`. Re-ingestion updates metadata but
  does NOT regenerate the embedding unless the image URL has changed.

---

## Data Flow: Query Path (Text Search)

```
User types query
      │
React Client (SearchBar component)
      │  POST /api/search  { query: string, mode: 'text' | 'image' | 'hybrid' }
      ▼
Express Route (server/routes/search.ts)
      │  validates input with Zod
      ▼
searchService.ts
      │  (1) Preprocess query (lowercase, truncate to 77 tokens)
      │  (2) Generate CLIP text embedding via clipService.ts
      │  (3) Call Supabase RPC: match_posters(embedding, threshold=0.72, count=20)
      │  (4) Augment results with metadata from posters table
      │  (5) Compute handoff flag: similarity_score < 0.72 → handoff_needed = true
      │  (6) Log search event to poster_search_events
      ▼
Express Response
      │  { results: PosterResult[], handoff_needed: bool, handoff_reason?: string }
      ▼
React Client (SearchResults + HandoffBanner components)
```

---

## Data Flow: Query Path (Image-to-Image Search)

```
User uploads or pastes image URL
      │
React Client
      │  POST /api/search  { image: base64 | url, mode: 'image' }
      ▼
Express Route → searchService.ts
      │  (1) Validate image (type check, size limit 5MB)
      │  (2) Generate CLIP image embedding
      │  (3) Supabase match_posters RPC (same threshold)
      │  (4) "Visual Siblings" — top 5 results by cosine similarity
      ▼
React Client (VisualSiblings component)
```

---

## Data Flow: The Archivist (RAG Chatbot)

```
User asks a question in the Archivist sidebar
      │
React Client (ArchivistSidebar component)
      │  POST /api/chat  { message: string, session_id: UUID, poster_context_ids: UUID[],
      │                    poster_similarity_scores?: Record<UUID, number> }
      ▼
Express Route (server/routes/chat.ts)
      ▼
archivistService.ts
      │  (1) Load session from archivist_sessions — SessionExpiredError (code: SESSION_EXPIRED) if expired
      │  (2) Fetch metadata for poster_context_ids from posters table (no embedding column)
      │  (3) Build XML context block (nara_id, title, date, creator, description,
      │       subject_tags, physical_description, overall_confidence, similarity_score)
      │  (4) Check token budget — summarize oldest message pairs via Claude if approaching 8,000 tokens
      │  (5) Assemble system prompt: base prompt + context block + optional confidence clause
      │       (clause appended when any similarity_score < 0.72)
      │  (6) Call Anthropic SDK stream: claude-sonnet-4-6, temperature=0.2, max_tokens=900
      │  (7) Stream text deltas → SSE: data: {"delta": "..."}
      │  (8) On stream complete: extract citations (scan for nara_id values in response text)
      │  (9) Persist updated session (messages, turn_count, total_tokens) to archivist_sessions
      │  (10) Send final SSE event: data: {"done": true, "citations": [...], "confidence": 0.85}
      ▼
Express Response (streamed via Server-Sent Events)
      │  Delta events: { delta: string }
      │  Final event:  { done: true, citations: Citation[], confidence: number }
      ▼
React Client (streams into ArchivistMessage component)
```

### Client-Side Archivist Architecture (Phase 9)

The client-side Archivist is built as three cooperating layers:

| Layer | File | Responsibility |
|-------|------|---------------|
| Hook | `hooks/useArchivist.ts` | Session ID (`sessionStorage`), streaming state machine, `ApiStreamError` detection, session-expiry recovery (spec 9.6) |
| Context | `lib/archivistContext.tsx` | Sidebar open/closed (`localStorage`), poster context map (nara_id → UUID) set by pages, forwards `sendMessage` to the hook |
| Sidebar | `components/ArchivistSidebar.tsx` | Fixed right panel (desktop `w-96`) / full-screen drawer (mobile), always-visible tab toggle, `aria-live` message list, `Enter`-to-send textarea |

**Session recovery (spec 9.6)**: If the SSE stream returns `{ error, code: 'SESSION_EXPIRED' }`, the hook silently generates a new `crypto.randomUUID()`, writes it to `sessionStorage`, and retries the message once. If the retry also fails, the error is surfaced in the UI.

**Poster context flow**: Each page calls `setPosterContext(ids, naraIdMap)` when its data loads. This propagates nara_id → UUID lookups into `ArchivistMessage` for citation link resolution. If a cited `nara_id` is not in the map, the link falls back to `/search?q={nara_id}&mode=text`.

---

## Module Boundaries (Enforced)

| Can Import | From |
|------------|------|
| `client/src/` | Only `shared/` for types; never `server/` |
| `server/routes/` | `server/services/`, `server/middleware/`, `shared/` |
| `server/services/` | `server/lib/`, `shared/` — never `routes/` |
| `server/lib/` | External packages only — no circular imports |
| `shared/` | External types/packages only |

---

## Key Third-Party Integrations

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| DPLA API (`api.dp.la/v2/items`) | Source of poster metadata + image URLs | API key (server-only) |
| CLIP model (Replicate or self-hosted) | Generating 768-dim multimodal embeddings | API key (server-only) |
| Supabase | PostgreSQL + pgvector + Auth + Storage | Service role key (server), anon key (client auth) |
| Anthropic API | The Archivist LLM responses | API key (server-only) |

---

## Infrastructure Decisions

- **Deployment target**: Railway (Express backend) + Vercel (React frontend SPA). Supabase hosts the database.
- **Database**: Supabase PostgreSQL — chosen for pgvector extension, Auth, and Storage
  (poster thumbnail CDN), and the generous free tier for prototyping.
- **CLIP model hosting**: Replicate (`cjwbw/clip-vit-large-patch14`, version hash in `.env.example`).
  Model ID note: `openai/clip-vit-large-patch14` does NOT exist on Replicate; the correct owner prefix is `cjwbw/`.
  If request volume warrants it, migrate to a self-hosted container on Railway.
- **No Kubernetes** — this is an MVP. Railway's usage-based pricing scales linearly.
- **Secrets**: Environment variables injected by Railway (backend) and Vercel (frontend). No `.env` committed to git.
  Local development uses `.env` at the monorepo root (gitignored).

---

## Human Handoff — The Red Button

The Red Button is not a fallback — it is a designed feature. It surfaces when the system
knows it cannot reliably serve the user.

**Trigger conditions:**
1. `similarity_score < 0.72` (CLIP cosine similarity below threshold)
2. `overall_confidence < 0.65` (poster was ingested with poor metadata)
3. Archivist explicitly acknowledges uncertainty in its parsed response

**What the Red Button does:**
- Renders a prominent CTA: "Request Expert Review"
- Pre-populates an email to `nara-reference@archives.gov` with:
  - The user's query
  - The top 3 poster IDs that were returned
  - The similarity scores
  - The Archivist's uncertainty statement (if applicable)
- Logs the handoff event to `poster_search_events.human_handoff_triggered`

**What the Red Button does NOT do:**
- It does not disable search results — low-confidence results are still shown
- It does not require authentication — any user can trigger it
