# Phase 2 — Express Server Skeleton

**Depends on**: [Phase 1 — Database Schema](./phase-1-database.md)
  (config.ts needs the full env var list established in Phase 1.1)
**Next phase**: [Phase 3 — Ingestion Pipeline](./phase-3-ingestion.md)

---

## Definition of Done

- `GET /api/health` returns `{ status: 'ok', db: 'connected', timestamp: string }`
- Server fails to start with a clear, human-readable error if any required env var is missing
- All security middleware applied in correct order: helmet → cors → json → rate limit
- Global error handler is the single place that formats error responses;
  no route calls `res.status(500)` directly
- Typed error classes (`NotFoundError`, `ValidationError`, `AIServiceError`) flow correctly
  through the error handler to the client
- `server/lib/supabase.ts` singleton connects successfully (health check queries `SELECT 1`)

---

## Small Bits

### 2.1 — Install server dependencies
- Production: `express@5`, `helmet`, `cors`, `express-rate-limit`, `zod`,
  `@supabase/supabase-js`, `@anthropic-ai/sdk`
- Dev: `typescript`, `tsx`, `@types/express`, `@types/cors`, `@types/node`

### 2.2 — `server/lib/config.ts`
- Zod schema that validates all vars defined in `.env.example`
- Export typed `config` object — this is the ONLY file that reads `process.env` directly
- Call `validateConfig()` at the very top of `server/index.ts` before any other imports
- On missing var: print the variable name and exit with code 1

### 2.3 — `server/lib/supabase.ts`
- Single Supabase client instance using `config.supabaseUrl` + `config.supabaseServiceRoleKey`
- Export as named singleton `supabase`
- Never export the key itself — only the client instance

### 2.4 — `server/middleware/errorHandler.ts`
- Define `AppError` base class with `statusCode` and `code` fields
- Extend to: `NotFoundError` (404), `ValidationError` (400), `AIServiceError` (503)
- Global error handler middleware: logs with context, returns `{ error: string, code?: string }`
  — never leaks stack traces when `NODE_ENV === 'production'`
- Register as the LAST middleware in `index.ts`

### 2.5 — `server/index.ts` — security middleware stack
Strict order per `security.md`:
1. `helmet()`
2. `cors({ origin: config.clientOrigin })`
3. `express.json({ limit: '1mb' })`
4. `express-rate-limit` on all `/api/` routes (100 req / 15 min)

Health route: `GET /api/health` — queries Supabase with `SELECT 1` to confirm DB connectivity;
returns `{ status: 'ok', db: 'connected', timestamp }` or `503` if DB is unreachable.

### 2.6 — Route registration scaffold
- Create empty router files: `server/routes/posters.ts`, `server/routes/search.ts`,
  `server/routes/chat.ts`
- Register all three in `index.ts` under `/api/posters`, `/api/search`, `/api/chat`
- Each route returns `501 Not Implemented` for now — intentional placeholder

### 2.7 — Unit tests for error handler
- `server/__tests__/errorHandler.test.ts`
- Test: `NotFoundError` produces HTTP 404
- Test: `ValidationError` produces HTTP 400
- Test: Unknown/untyped error produces HTTP 500 without leaking the original message
  (simulate `NODE_ENV === 'production'`)

---

## Testing Checkpoint

- `npm run dev:server` — server starts; logs confirm each middleware layer loaded in order
- `curl localhost:3001/api/health` → `{ status: 'ok', db: 'connected' }`
- Start server without `.env` → exits immediately with a clear config error message, not a crash
- `curl localhost:3001/api/search` → `501 Not Implemented` (scaffold confirmed)
- `npm test` — error handler unit tests pass
