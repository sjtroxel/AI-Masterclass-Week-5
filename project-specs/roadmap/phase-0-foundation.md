# Phase 0 — Repository Foundation

**Depends on**: Nothing. This is the starting point.
**Next phase**: [Phase 1 — Database Schema](./phase-1-database.md)

---

## Definition of Done

- `npm run dev` starts both client (port 5173) and server (port 3001) without errors
- `npm test` runs and passes (no tests yet, but the runner is configured and exits 0)
- `npm run lint` and `npm run typecheck` pass clean
- GitHub Actions CI runs on every push and executes lint + typecheck + test
- `.env.example` exists; `.env` is gitignored and never committed
- Pre-commit hook enforces lint + unit tests before every commit

---

## Small Bits

### 0.1 — Initialize monorepo structure
- Create `package.json` at root with `workspaces: ["client", "server", "shared"]`
- Create `client/`, `server/`, `shared/` directories with their own `package.json` files
- Add root-level scripts: `dev`, `dev:client`, `dev:server`, `build`, `test`, `lint`, `typecheck`
- Add `concurrently` at root for `npm run dev` to run both workspaces

### 0.2 — Configure TypeScript (strict mode)
- Root `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`
- `client/tsconfig.json` extends base, adds Vite DOM lib
- `server/tsconfig.json` extends base, targets Node 20, `module: NodeNext`
- `shared/tsconfig.json` extends base, library mode (no DOM)
- Verify `npm run typecheck` runs `tsc --noEmit` across all three workspaces

### 0.3 — Initialize Vite (client) and tsx (server)
- `npm create vite@latest client -- --template react-ts`
- Strip default Vite boilerplate; leave only a minimal `App.tsx` returning `<div>Poster Pilot</div>`
- Add `tsx` + `express` dependencies to `server/`
- Create `server/index.ts` — bare Express app on port 3001 with a single `GET /api/health` route
  returning `{ status: 'ok' }`

### 0.4 — ESLint across workspaces
- Configure `eslint.config.mjs` at root covering all three workspaces
- Rules: `no-console` (warn), TypeScript strict plugin, React hooks plugin for client
- Verify `npm run lint` passes on the empty scaffolding

### 0.5 — Configure Vitest
- Add Vitest to root devDependencies
- `vitest.config.ts` at root: runs `**/__tests__/**/*.test.ts` across all workspaces
- Create one placeholder test in `server/__tests__/health.test.ts` that asserts `true`
- Verify `npm test` exits 0

### 0.6 — Create TESTING.md
- Create `TESTING.md` at root documenting:
  - Testing philosophy: tests are anchored to the spec, never to the implementation (no circular validation)
  - Naming conventions: `*.test.ts`, co-located in `__tests__/` beside the module
  - Coverage threshold: 80% for `server/services/`
  - When to use Vitest vs. Playwright

### 0.7 — GitHub Actions CI pipeline
- Create `.github/workflows/ci.yml`
- Jobs: `lint`, `typecheck`, `test` — all run on every push and PR
- Add `npm audit --audit-level=high` step; fail CI on HIGH or CRITICAL vulnerabilities
- Add `gitleaks` scan step to detect accidentally committed secrets
- Add all production secrets to GitHub repo secrets (never committed):
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.

### 0.8 — Pre-commit hook
- Add `husky` + `lint-staged` to root devDependencies
- Pre-commit hook runs: `npm run lint` + `npm test` (fast unit tests only)
- The hook fires when YOU run `git commit` — it validates your commit, not Claude's.
  Claude never runs `git commit` or any git write command. All commits are yours.
- Verify hook fires on `git commit` and blocks on failure

### 0.9 — Environment setup
- Create `.env.example` at root with all required variables (placeholder values only):
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NARA_API_KEY`, `REPLICATE_API_KEY`, `CLIP_MODEL_VERSION`, `PORT`, `CLIENT_ORIGIN`
- Create `server/lib/config.ts` — validates all required vars at startup using Zod;
  server refuses to start with a clear error message if any are missing
- Verify that starting the server without a `.env` file prints a clear config error and exits

---

## Testing Checkpoint

- Run `npm run lint && npm run typecheck && npm test` — all green
- Trigger a GitHub push and verify CI passes end-to-end
- Confirm git commit is blocked when lint fails (introduce a deliberate linting error, then fix it)
- Start the server without a `.env` file — confirm it exits with a clear config error, not a crash
