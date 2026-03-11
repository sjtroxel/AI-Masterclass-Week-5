# Phase 10 — Hardening, Testing & Deployment ✅ COMPLETE

**Completed**: 2026-03-10
**Backend**: `https://poster-pilot.up.railway.app`
**Frontend**: `https://poster-pilot.vercel.app`
**Posters ingested**: 5,000+ across 43 series

**Depends on**: [Phase 9 — Archivist Sidebar UI](./phase-9-archivist-ui.md)
  (all features must be complete and manually verified before hardening begins)
**Next phase**: None. This is the final phase.

---

## Deployment Notes (What Actually Happened)

### Monorepo shared package fix
`shared/package.json` exports must point to compiled JS for production:
- `exports.types`: `./src/index.ts` (TypeScript uses this during tsc compilation)
- `exports.default`: `./dist/index.js` (Node.js uses this at runtime — cannot load .ts)
- `pretest` script added to root package.json to build shared before vitest runs in CI

### railway.toml (required — without it Railway uses wrong build command)
```toml
[build]
builder = "nixpacks"
buildCommand = "npm run build:railway"   # NOT "npm ci && ..." — Railway runs npm ci itself

[deploy]
startCommand = "node server/dist/index.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

### Railway dashboard settings to clear
- **Custom Build Command**: clear it (dashboard overrides railway.toml if set)
- **Watch Paths**: clear it (default `/server/**` ignores root-level commits)
- **Networking port**: 8080 (Railway injects PORT=8080, not 3001)

### Vercel settings
- Root Directory: `./` (repo root — workspace resolution requires seeing all packages)
- Build Command: `npm run build --workspace=shared && npm run build --workspace=client`
- Output Directory: `client/dist`
- `client/vercel.json`: `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`

---

## Definition of Done

- Vitest coverage ≥ 80% for every file in `server/services/`
- Playwright E2E tests cover all critical user flows and pass in CI
- Zero axe-core violations on any page route
- Supabase Edge Function `cleanup-expired-sessions` is deployed and scheduled nightly
- Railway backend is live and returning `{ status: 'ok', db: 'connected' }` from `/api/health`
- Vercel frontend is live and loading the app with working search
- GitHub Actions CI passes against the production environment (Playwright runs against Vercel preview URL)
- CORS `origin` allowlist contains the exact Vercel production domain — not `*`
- Zero secrets in the codebase; all are in Railway/Vercel environment variables

---

## Small Bits

### 10.1 — Coverage audit and gap-fill
- Run `npm test --coverage` and review the HTML coverage report
- Write additional unit tests for any `server/services/` file below 80%
- Priority order: `searchService` → `archivistService` → `clipService` → `queryAnalyzer`
- Do not write tests to hit coverage numbers — write tests for real untested behaviors
  identified in the spec documents

### 10.2 — Playwright E2E test suite
- Install Playwright; configure `e2e/` directory at root
- Create `playwright.config.ts` at root; add `test:e2e` script to `package.json`

Critical flows to cover:
- Text search returns results; at least one result renders a confidence badge
- Nonsense query → `HandoffBanner` appears; "Request Expert Review" generates correct `mailto:`
- Click a poster card → navigates to `/poster/:id` → metadata renders → Visual Siblings load
- Archivist: type a question → streaming response appears word-by-word → citations render as links
- Dark mode toggle: switches appearance; class `dark` on `<html>` persists after reload
- Mobile layout (viewport 375px): 2-column grid renders; Archivist sidebar is hidden by default

### 10.3 — Accessibility audit
- Add `@axe-core/playwright` to devDependencies
- In each Playwright test: run `checkA11y()` after the page has fully loaded
- Fix all violations before marking this step complete

Specific items from `UI_UX_SPEC.md` to verify:
- `aria-live="polite"` is present on the Archivist message container
- `role="alert"` fires on `HandoffBanner` first appearance
- `role="meter"` and `aria-valuenow` are on every `ConfidenceIndicator`
- All poster `<img>` elements have correct alt text format
- Focus rings are visible on all interactive elements (Tailwind `ring-2 ring-primary-500`)
- Color contrast ≥ 7:1 for `--color-text` on `--color-surface` in both modes

### 10.4 — Supabase Edge Function: session cleanup
- Create `supabase/functions/cleanup-expired-sessions/index.ts`
- Logic: `DELETE FROM archivist_sessions WHERE expires_at < now()`
- Use the service role key (injected via Supabase function secrets, not hardcoded)
- Create `supabase/functions/cleanup-expired-sessions/cron.json`: schedule nightly at 02:00 UTC
- Deploy via `supabase functions deploy cleanup-expired-sessions`
- Verify in Supabase dashboard: function appears, schedule is active

### 10.5 — Railway deployment (backend)
- Connect Railway project to the GitHub repo; configure auto-deploy from `main`
- Railway start command: `npm run build:server && node dist/server/index.js`
  (or `tsx server/index.ts` if building in-process — confirm which approach)
- Add all required environment variables to Railway:
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`, `NARA_API_KEY`, `REPLICATE_API_KEY`, `CLIP_MODEL_VERSION`,
  `PORT`, `CLIENT_ORIGIN` (set to the Vercel production URL)
- Verify: `GET https://your-railway-url.railway.app/api/health` → `{ status: 'ok', db: 'connected' }`

### 10.6 — Vercel deployment (frontend)
- Connect Vercel project to the GitHub repo; configure auto-deploy from `main`
- Build settings: Framework = Vite, Root Directory = `client/`, Output = `dist/`
- Add `VITE_API_URL` environment variable pointing to the Railway production URL
- Create `client/vercel.json`:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
  (required for client-side React Router routes to work on direct URL access)
- Verify: production Vercel URL loads the app; a search returns results from Railway

### 10.7 — Confirm CORS for production
- In Railway environment: confirm `CLIENT_ORIGIN` is the exact Vercel domain
  (e.g., `https://poster-pilot.vercel.app`) — not `*`, not `localhost`
- Test from production: search from the Vercel URL succeeds; search from an unlisted
  origin returns a CORS error in the browser console (expected and correct)

### 10.8 — CI/CD production gates
- Add Playwright E2E job to `.github/workflows/ci.yml`:
  runs after the unit test job, targets the Vercel preview URL for PR builds
- Confirm `npm audit --audit-level=high` still fails CI on HIGH/CRITICAL vulnerabilities
- Confirm `gitleaks` scan runs on every PR
- Enable Dependabot in GitHub repo settings (Code Security → Dependabot alerts)

### 10.9 — Full ingest run
- Run `npm run ingest` targeting all four series:
  WPA Posters, NASA History, Patent Medicine Ads, WWII Propaganda
- Verify all series have poster rows, centroids are computed, confidence scores populated
- Spot-check search results from each series to confirm embeddings are meaningful

---

## Testing Checkpoint

- `npm test --coverage` — ≥ 80% coverage on every file in `server/services/`
- `npm run test:e2e` — all Playwright tests pass locally against `localhost`
- Playwright E2E passes in GitHub Actions against the Vercel preview URL on a test PR
- Axe audit: zero violations across all five page routes
- Production smoke test: open the Vercel URL → type "WPA labor poster" → results appear
- `GET https://railway-url/api/health` → `{ status: 'ok', db: 'connected' }`
- Attempt a search from `localhost` against the production Railway URL → CORS error (correct)
