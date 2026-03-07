# Poster Pilot — Testing Philosophy & Conventions

## Philosophy

**Tests are anchored to the spec, never to the implementation.**

A test that simply re-states what the code does (e.g., "calling `foo()` returns what `foo()` returns")
provides no value and creates circular validation. Every test must assert a behavior that is
independently derivable from a spec document — `DATA_SCHEMA.md`, `RAG_STRATEGY.md`, or the
phase roadmap — not from reading the implementation.

Practical rule: if deleting a function and rewriting it from scratch would still pass your test,
the test is anchored to the spec. If the test would need rewriting too, it is anchored to the
implementation.

---

## Naming Conventions

| Item | Convention |
|------|-----------|
| Test files | `*.test.ts` or `*.spec.ts` — never `.js` |
| Location | `__tests__/` directory co-located beside the module under test |
| Example | `server/services/__tests__/clipService.test.ts` |
| Describe blocks | Named after the module or function being tested |
| Test names | Plain English assertions: `"returns 404 when poster id is not found"` |

```
server/
  services/
    clipService.ts
    __tests__/
      clipService.test.ts   ← co-located here, not in a top-level /tests dir
```

---

## Coverage Thresholds

| Scope | Threshold | Enforced by |
|-------|-----------|-------------|
| `server/services/` | 80% line + branch | Vitest coverage (Phase 10) |
| `shared/` | 100% for constants and type guards | Manual — all exports must have tests |
| `client/` | Best-effort; hooks and pure utils only | No enforced threshold |

Coverage is configured but **not yet enforced** in CI until Phase 10 (Hardening). The 80%
floor is the target, not a gate, until the codebase is mature enough for it to be meaningful.

---

## Vitest vs. Playwright

### Use Vitest for:
- Unit tests on pure functions (embedding preprocessing, confidence score calculation)
- Service layer logic with mocked Supabase and API clients
- Shared type guards and utility functions
- All of `server/services/` and `shared/`

### Use Playwright for:
- Full end-to-end user flows: search → result → detail page → Archivist
- The Human Handoff (Red Button) interaction from the user's perspective
- Cross-browser rendering validation for the poster grid and detail views
- Any test that requires a real running browser with real network responses

### Never do:
- E2E tests that call the real Anthropic or Supabase APIs — always use seeded fixtures
- Unit tests that spin up the Express server — use supertest or direct service calls
- Snapshot tests — they encode implementation, not spec behavior

---

## AI Feature Testing

Because CLIP and The Archivist involve external APIs, their tests follow a strict pattern:

1. **All Anthropic and Replicate API calls are mocked** — never make real API calls in tests.
2. **Fixtures come from `server/__fixtures__/`** — pre-recorded embeddings and API responses.
3. **Integration tests verify the wiring**, not the AI output: does the service call the API
   with the right parameters? Does it handle a `similarity_score < 0.72` response correctly?
4. **Never assert on exact AI-generated text** — assert on structure, citations present/absent,
   and the handoff trigger condition.

---

## Running Tests

```bash
npm test              # Vitest unit tests (run once, CI mode)
npm run test:watch    # Vitest in watch mode (development)
npm run test:e2e      # Playwright E2E tests (requires running dev servers)
```
