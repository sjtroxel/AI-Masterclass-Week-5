# Security Rules — All Paths

These rules apply across the entire codebase. They are non-negotiable.

## Secret Management
- API keys (Anthropic, Supabase service role) NEVER appear in client-side code.
- All secrets are accessed via `server/lib/config.ts` which reads from environment variables.
- The `.env` file is in `.gitignore`. The repo contains only `.env.example` with placeholder values.
- In production, secrets are injected via the deployment platform (Railway/environment variables).

## Express Security Baseline
Every Express app bootstrap (`server/index.ts`) must include in this order:
1. `helmet()` — sets secure HTTP headers
2. `cors()` with an explicit `origin` allowlist (not `*` in production)
3. `express.json({ limit: '1mb' })` — prevent payload flooding
4. Rate limiting via `express-rate-limit` on all `/api/` routes (100 req/15min default)
5. Input validation on every route that accepts user input

## Input Validation
- All user-facing query parameters and request bodies are validated with Zod before
  reaching any service function.
- Search queries: max 500 characters, sanitized of SQL metacharacters.
- Image uploads (for image-to-image search): max 5MB, MIME type checked server-side,
  not just by Content-Type header.

## Supabase RLS
- Row Level Security is ALWAYS enabled. Do not disable it for convenience.
- Public posters table: anon read is allowed; write is service-role only.
- `poster_search_events` table: write is service-role only; no anon access.
- `archivist_sessions` table: write is service-role only; anon read is forbidden.

## CI/CD Security Scanning
- `gitleaks` runs on every PR to scan for accidentally committed secrets.
- `npm audit` runs in CI; builds fail on HIGH or CRITICAL vulnerabilities.
- Dependencies are updated monthly; Dependabot alerts are triaged within 7 days.

## What Claude Should Never Do in This Codebase
- Generate code that puts the Supabase service role key in any client-side file.
- Generate code that disables CORS or sets `origin: '*'` in production config.
- Generate SQL that uses string interpolation — always use parameterized queries or
  the Supabase query builder.
- Generate code that logs full request bodies (which may contain user queries/PII).
