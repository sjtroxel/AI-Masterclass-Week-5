# Poster Pilot — Project Context for Claude

## Project Overview
Poster Pilot is a professional-grade, multimodal RAG (Retrieval-Augmented Generation) platform
for indexing and exploring the National Archives (NARA) poster corpus — WPA art, NASA mission
posters, 19th-century patent medicine ads, and more. It is a Discovery Engine for visual history.

## Tech Stack
- **Frontend**: React 19, TypeScript (strict), Tailwind CSS v4 (CSS-first, no JS config)
- **Backend**: Node.js + Express 5.x — explicit routing, no heavy abstractions
- **Database**: Supabase (PostgreSQL + pgvector) for metadata storage and semantic retrieval
- **AI/ML**: CLIP embeddings (OpenAI `clip-vit-large-patch14`) for multimodal search
- **LLM**: Claude claude-sonnet-4-6 via Anthropic SDK for The Archivist chatbot
- **Testing**: Vitest (unit), Playwright (E2E)
- **Build**: Vite (frontend), tsx/esbuild (backend)
- **Package Manager**: npm workspaces (monorepo: `/client`, `/server`, `/shared`)

## Architecture
```
poster-pilot/
├── client/          # React 19 frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI components (PascalCase files)
│   │   ├── hooks/        # Custom React hooks (use* prefix)
│   │   ├── pages/        # Route-level page components
│   │   ├── lib/          # Client-side utilities
│   │   └── types/        # Shared TypeScript types (re-exported from /shared)
├── server/          # Express API
│   ├── routes/      # One file per resource (posters.ts, search.ts, chat.ts)
│   ├── services/    # Business logic (clipService.ts, archivistService.ts)
│   ├── middleware/  # Express middleware (auth, rateLimit, errorHandler)
│   └── lib/         # Server utilities (supabase client, etc.)
├── shared/          # Types and constants shared between client and server
└── project-specs/   # Specification documents — source of truth
```

Key module boundaries:
- `client/` may NOT import from `server/` — shared types come from `shared/`
- `server/routes/` contains ONLY request parsing and response formatting
- Business logic lives exclusively in `server/services/`
- The Supabase client is a singleton in `server/lib/supabase.ts`

## Development Commands
```bash
npm run dev          # Start both client (Vite) and server (tsx watch) concurrently
npm run dev:client   # Vite dev server only (port 5173)
npm run dev:server   # Express server only (port 3001, tsx watch)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run build        # Build client + server for production
npm run lint         # ESLint across all workspaces
npm run typecheck    # tsc --noEmit across all workspaces
```

## Code Style & Conventions

### TypeScript
- Strict mode enabled (`strict: true` in tsconfig). No `any` types — use `unknown` + type guards.
- Explicit return types on all functions exported from `services/` and `routes/`.
- Use `type` for object shapes, `interface` only when declaration merging is needed.
- All async functions must handle errors explicitly — no unhandled promise rejections.

### Naming
- Files: `camelCase.ts` for utilities/services, `PascalCase.tsx` for React components
- Database columns: `snake_case` (Supabase convention)
- TypeScript variables/functions: `camelCase`
- TypeScript types/interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- React components: `PascalCase` function names

### Express Routes (Explicit Pattern)
```typescript
// CORRECT — explicit, readable, no magic
router.get('/posters/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  // validate, call service, respond
});

// WRONG — do not use controller classes, decorators, or IoC containers
```

### Tailwind v4
- CSS-first configuration only — all design tokens live in `client/src/index.css`
- No `tailwind.config.js` — this project uses v4's `@theme` directive
- Use CSS custom properties via `@theme {}` for all colors, fonts, spacing

## Testing Requirements
- Unit tests: Vitest, co-located in `__tests__/` beside the module under test
- E2E tests: Playwright in `/e2e/` directory
- Test files: `*.test.ts` or `*.spec.ts` (never `.js`)
- Minimum coverage: 80% for `server/services/`
- Every AI feature (CLIP search, Archivist) must have integration tests with mocked API calls
- Run `npm test` before every commit (enforced via pre-commit hook)

## Git Conventions
- Branch naming: `feature/short-description`, `fix/issue-description`, `chore/task-name`
- Commit format: `type(scope): description` — e.g., `feat(search): add CLIP vector similarity`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`
- PRs require: passing CI, at least one human review, no TypeScript errors
- Never commit `.env` files or Supabase service role keys

## Guardrails — What NOT To Do
- **No `SELECT *`** — always specify columns in Supabase queries
- **No API keys on the client** — all AI/Supabase service-role calls go through the Express server
- **No magic frameworks** — no NestJS decorators, no tRPC, no ORM magic. Raw SQL via Supabase client.
- **No `any` in TypeScript** — use proper types or `unknown` with narrowing
- **No direct DOM manipulation in React** — use refs or state
- **No catching errors silently** — always log and either re-throw or return a typed error response
- **The Archivist must cite sources** — every chatbot response must reference specific NARA metadata fields; it must NOT fabricate historical facts
- **Confidence scores are mandatory** — every vector search result must return a `similarity_score`; The Human Handoff triggers at `similarity_score < 0.72`
- **NARA data is read-only** — this platform indexes NARA content; it never modifies upstream records
