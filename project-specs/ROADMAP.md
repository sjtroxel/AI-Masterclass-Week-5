# Poster Pilot — Master Build Schedule

Granular tasks, Small Bits, and testing checkpoints live in the individual phase files
under `project-specs/roadmap/`. This document is the high-level schedule: dependencies,
Definitions of Done, and build order.

**Build philosophy**: No phase begins until the previous phase's DoD is fully verified.
Each phase is a gate, not a suggestion.

**The Build Loop** (repeat inside every phase):
> Build it → Test it → Iterate on feedback.
> Spent > ~10 minutes debugging something the AI got fundamentally wrong?
> Stop. Open a clean context. Regenerate with better instructions. Restart is a feature.

**Testing discipline**: Every test is anchored to the spec documents in `project-specs/`,
never to the implementation. AI writing tests for its own code is circular validation.

---

## Master Dependency Graph

```
Phase 0: Foundation
  └── Phase 1: Database & Shared Types
        └── Phase 2: Server Skeleton
              ├── Phase 3: Ingestion Pipeline
              │     └── Phase 4: Search API
              │           ├── Phase 5: Archivist API ─────────────────────────┐
              │           └── Phase 6: Frontend Shell                          │
              │                 └── Phase 7: Search UI                         │
              │                       └── Phase 8: Detail & Series Pages       │
              │                             └── Phase 9: Archivist Sidebar UI ←┘
              │                                   └── Phase 10: Hardening & Deployment
              └── Phase 6: Frontend Shell (can start in parallel with Phase 3)
```

**Parallelism note**: Phase 5 (Archivist API) and Phase 6 (Frontend Shell) can be
built in parallel once Phase 4 is complete — they have no dependency on each other.

---

## Phase Schedule

### Phase 0 — Repository Foundation
**File**: [`roadmap/phase-0-foundation.md`](./roadmap/phase-0-foundation.md)
**Depends on**: Nothing.

**Definition of Done**:
- `npm run dev` starts both workspaces without errors
- `npm test`, `npm run lint`, `npm run typecheck` all pass
- GitHub Actions CI runs on every push
- Pre-commit hook enforces lint + tests
- `.env.example` committed; `.env` gitignored

---

### Phase 1 — Shared Types & Database Schema
**File**: [`roadmap/phase-1-database.md`](./roadmap/phase-1-database.md)
**Depends on**: Phase 0

**Definition of Done**:
- All 4 tables exist in Supabase with correct columns and constraints
- Both RPCs (`match_posters`, `get_visual_siblings`) callable from the dashboard
- RLS verified: anon can read `posters`; anon cannot access `archivist_sessions`
  or `poster_search_events`
- `shared/` compiles clean and is importable from both `client/` and `server/`

---

### Phase 2 — Express Server Skeleton
**File**: [`roadmap/phase-2-server.md`](./roadmap/phase-2-server.md)
**Depends on**: Phase 1

**Definition of Done**:
- `GET /api/health` returns `{ status: 'ok', db: 'connected', timestamp }`
- Server fails to start with a clear error if any required env var is missing
- Security middleware applied in correct order: helmet → cors → json → rate limit
- Global error handler is the single formatter for all error responses
- Typed error classes (`NotFoundError`, `ValidationError`, `AIServiceError`, `SessionExpiredError`) work correctly

---

### Phase 3 — Ingestion Pipeline
**File**: [`roadmap/phase-3-ingestion.md`](./roadmap/phase-3-ingestion.md)
**Depends on**: Phase 2

**Definition of Done**:
- `npm run ingest` fetches a series from DPLA and inserts rows with 768-dim embeddings
- `overall_confidence`, `metadata_completeness`, `embedding_confidence` populated on every row
- Re-ingest deduplicates by `nara_id` — no embedding regenerated for unchanged records
- CLIP preprocessing is idempotent; 77-token truncation logs a warning

---

### Phase 4 — Search API ✅
**File**: [`roadmap/phase-4-search-api.md`](./roadmap/phase-4-search-api.md)
**Depends on**: Phase 3 (real poster data required for meaningful testing)

**Definition of Done**:
- ✅ `POST /api/search` works for all 4 modes: `text`, `image`, `hybrid`, `vibe`
- ✅ Every result has `similarity_score`; `handoff_needed: true` when any score < 0.72
- ✅ Every search is logged to `poster_search_events` (async, non-blocking)
- ✅ `GET /api/posters/:id` and siblings endpoints return correct typed responses
- ✅ All input is Zod-validated; oversized queries/images rejected with 400

---

### Phase 5 — Archivist (RAG) API ✅
**File**: [`roadmap/phase-5-archivist-api.md`](./roadmap/phase-5-archivist-api.md)
**Depends on**: Phase 4
**Parallel with**: Phase 6 (no cross-dependency)

**Definition of Done**:
- ✅ `POST /api/chat` streams via SSE; delta events and a final `done` event
- ✅ Session history loaded from and persisted to `archivist_sessions`
- ✅ Context block limited to 5 posters; `embedding` column never fetched
- ✅ Token budget enforced at < 8,000; history compressed (not truncated) when needed
- ✅ Confidence clause appended to system prompt when `similarity_score < 0.72`
- ✅ Model called with exactly `temperature: 0.2`, `max_tokens: 900`

---

### Phase 6 — Frontend Shell
**File**: [`roadmap/phase-6-frontend-shell.md`](./roadmap/phase-6-frontend-shell.md)
**Depends on**: Phase 2 (endpoint shapes needed for typed API client)
**Parallel with**: Phase 5 (no cross-dependency)

**Definition of Done**:
- App loads at `localhost:5173`; all five routes render stub pages
- Dark mode toggle works, persists via `localStorage`, respects `prefers-color-scheme`
- All Tailwind v4 design tokens from `UI_UX_SPEC.md` defined in `client/src/index.css`
- Typed API client and `debug` utility available; no `console.log` in committed code
- No hardcoded color values in any component

---

### Phase 7 — Search UI
**File**: [`roadmap/phase-7-search-ui.md`](./roadmap/phase-7-search-ui.md)
**Depends on**: Phase 4 (live API), Phase 6 (design system, API client)

**Definition of Done**:
- Text search returns results in a responsive masonry grid with correct confidence badges
- `HandoffBanner` appears when `handoff_needed: true`; pre-fills `mailto:` correctly; dismissible
- All 4 search modes work; skeleton/empty/error states render correctly
- No infinite scroll — "Load 20 More" button only
- Search query synced to URL params; results are shareable
- All components keyboard-accessible; all images have correct alt text

---

### Phase 8 — Poster Detail & Series Pages ✅
**File**: [`roadmap/phase-8-detail-pages.md`](./roadmap/phase-8-detail-pages.md)
**Depends on**: Phase 4 (detail + siblings endpoints), Phase 7 (`PosterCard`, `ConfidenceIndicator`)

**Definition of Done**:
- ✅ `PosterDetailPage`: full metadata, Visual Siblings strip, "Open in NARA →" link, breadcrumb
- ✅ `SeriesPage`: paginated browse grid, no similarity badges in browse mode
- ✅ `AboutPage`: static content with NARA attribution
- ✅ All pages responsive across 3 breakpoints; no axe violations

---

### Phase 9 — Archivist Sidebar UI ✅
**File**: [`roadmap/phase-9-archivist-ui.md`](./roadmap/phase-9-archivist-ui.md)
**Depends on**: Phase 5 (SSE endpoint), Phase 8 (all pages in place)

**Definition of Done**:
- ✅ `ArchivistSidebar`: persistent on desktop, drawer on mobile; open state in `localStorage`
- ✅ Messages stream word-by-word; citations are clickable links to poster detail pages
- ✅ Handoff notice appears inside sidebar when Archivist confidence is low
- ✅ "How are these related?" button opens sidebar and pre-seeds the Archivist
- ✅ `session_id` scoped to `sessionStorage` (cleared on tab close)
- ✅ Anthropic API never called from client code

---

### Phase 10 — Hardening, Testing & Deployment ✅
**File**: [`roadmap/phase-10-hardening.md`](./roadmap/phase-10-hardening.md)
**Depends on**: Phase 9 (all features complete)

**Definition of Done**:
- ✅ Vitest coverage ≥ 80% for all `server/services/` files (99.54% statements, 92.48% branch)
- ✅ Playwright E2E tests: 31/31 passing across 6 spec files
- ✅ Zero axe-core violations on any route
- ✅ Supabase Edge Function `cleanup-expired-sessions` deployed and scheduled nightly at 02:00 UTC
- ✅ Railway backend live at `https://poster-pilot.up.railway.app` — `/api/health` → `{ status: 'ok', db: 'connected' }`
- ✅ Vercel frontend live at `https://poster-pilot.vercel.app` — full search-to-results flow works
- ✅ CORS locked to `https://poster-pilot.vercel.app` — never `*`
- ✅ All secrets in Railway/Vercel environment variables — zero in the codebase
- ✅ 5,000+ posters ingested across 43 series from DPLA

---

## Cross-Cutting Rules

These apply at every phase. A code review that finds any of these is a blocker — fix before merging.

| Rule | Why |
|------|-----|
| No `SELECT *` | The `embedding` column is 768 floats; never fetch it outside similarity operations |
| No `process.env.X` outside `server/lib/config.ts` | Single, validated source of truth for env vars |
| No `fetch()` in React components | Use `client/src/lib/api.ts` — typed, centralized |
| No `console.log` in client code | Use `client/src/lib/debug.ts` |
| No hardcoded hex colors in components | Tailwind utilities or CSS custom properties only |
| No silent error catches | Log + re-throw or return typed error response |
| No `any` in TypeScript | Use `unknown` + type guards |
| Service role key never in client workspace | Server-only — bypasses RLS |
| CORS never set to `*` | Explicit `origin` allowlist always |
| `similarity_score` on every search result | If it's missing, the response shape is wrong |

---

## Phase Gate Summary

| Phase | Name | Key Dependency | Status | DoD Signal |
|-------|------|---------------|--------|------------|
| 0 | Foundation | — | ✅ | CI green; pre-commit hooks fire |
| 1 | Database | Phase 0 | ✅ | All tables + RLS verified in Supabase |
| 2 | Server Skeleton | Phase 1 | ✅ | Health check hits DB; error handler tested |
| 3 | Ingestion | Phase 2 | ✅ | Real poster rows with confidence scores in Supabase |
| 4 | Search API | Phase 3 | ✅ | All 4 modes return typed results; handoff works |
| 5 | Archivist API | Phase 4 | ✅ | SSE streams; session persists; budget enforced |
| 6 | Frontend Shell | Phase 2 | ✅ | App loads; dark mode; API client typed |
| 7 | Search UI | Phases 4 + 6 | ✅ | Full search flow; Red Button works; responsive |
| 8 | Detail Pages | Phases 4 + 7 | ✅ | All routes; Visual Siblings; NARA links |
| 9 | Archivist UI | Phases 5 + 8 | ✅ | Streaming; citations; pre-seed from siblings |
| 10 | Hardening | Phase 9 | ✅ | 253 tests passing; Railway + Vercel live; 5,000+ posters |
