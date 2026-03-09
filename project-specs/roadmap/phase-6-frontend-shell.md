# Phase 6 — Frontend Shell

**Status**: ✅ Complete — 194 tests still passing (no new Vitest tests; shell verified visually per spec), typecheck clean.

**Depends on**: [Phase 2 — Server Skeleton](./phase-2-server.md)
  (the typed API client needs to know the server's endpoint structure;
  Phase 4 does not need to be complete — the client just needs the shapes)
**Next phase**: [Phase 7 — Search UI](./phase-7-search-ui.md)

> **Note**: Phase 6 can begin in parallel with Phase 5 (Archivist API) since the
> frontend shell has no dependency on the chat endpoint.

---

## Definition of Done

- App loads at `localhost:5173` without errors or console warnings
- Dark mode toggle works and persists via `localStorage`;
  respects `prefers-color-scheme` on first load before user sets a preference
- All Tailwind v4 design tokens from `UI_UX_SPEC.md` are defined in `client/src/index.css`
- React Router 6 is configured with all five page routes (stub pages for now)
- `client/src/lib/api.ts` has typed methods for all server endpoints
- `client/src/lib/debug.ts` is available; no `console.log` in any committed code
- No hardcoded hex color values in any component file — all via Tailwind utilities or
  CSS custom properties defined in `index.css`

---

## Small Bits

### 6.1 — Install client dependencies
- `react-router-dom@6`
- `@fontsource-variable/inter`
- `@fontsource-variable/playfair-display`
- `@fontsource-variable/jetbrains-mono`

### 6.2 — `client/src/index.css` — Tailwind v4 design tokens
Full `@theme {}` block from `UI_UX_SPEC.md`:
- Typography: `--font-sans`, `--font-serif`, `--font-mono`
- Primary color scale: `--color-primary-50` through `--color-primary-900` (oklch values)
- Surface tokens: `--color-surface`, `--color-surface-2`, `--color-surface-3`, `--color-border`,
  `--color-text`, `--color-text-muted`
- Accent tokens: `--color-danger`, `--color-danger-text`, `--color-success`, `--color-warning`
- Spacing: `--spacing-discovery`
- Border radius: `--radius-card`, `--radius-button`
- Shadows: `--shadow-card`, `--shadow-card-hover`

`@variant dark {}` block with all dark mode overrides (surface and text tokens only;
primary and accent remain unchanged).

Verify by applying `text-primary-500` to a test element and confirming the correct color
renders in both light and dark mode.

### 6.3 — `client/src/lib/debug.ts`
- `export function debug(message: string, ...args: unknown[]): void`
- Only logs when `import.meta.env.DEV === true`
- This is the ONLY logging utility permitted in client code

### 6.4 — `client/src/lib/api.ts` — typed API client
All methods use `fetch()` internally; components never call `fetch()` directly.

- `search(request: SearchRequest): Promise<SearchResponse>`
- `getPoster(id: string): Promise<Poster>`
- `getPosterSiblings(id: string): Promise<PosterSummary[]>`
- `getSeries(slug: string, page: number): Promise<{ series: Series; posters: PosterSummary[] }>`
- `chat(params: ChatParams): EventSource` — opens SSE stream to `/api/chat`;
  returns an `EventSource` instance for the caller to attach event listeners

Base URL: read from `import.meta.env.VITE_API_URL` (set in `.env`)

### 6.5 — App shell and routing
- Configure `BrowserRouter` in `client/src/main.tsx`
- Define all five routes in `client/src/App.tsx`:
  - `/` → `HomePage`
  - `/search` → `SearchPage`
  - `/poster/:id` → `PosterDetailPage`
  - `/series/:slug` → `SeriesPage`
  - `/about` → `AboutPage`
- Create stub page components in `client/src/pages/`:
  each returns a centered `<div>` with the page name in the design system's body font

### 6.6 — `Header` component
- `client/src/components/Header.tsx`
- Wordmark in Playfair Display font, placeholder for the search area, dark mode toggle
- Dark mode toggle logic:
  1. On mount: check `localStorage` for saved preference; fall back to `prefers-color-scheme`
  2. On toggle: flip `class="dark"` on `<html>`, write to `localStorage`
- Tailwind utilities only — no inline styles, no hardcoded hex values

### 6.7 — `Footer` component
- `client/src/components/Footer.tsx`
- Links: About, NARA Catalog (external), Feedback
- All external links: `target="_blank" rel="noopener noreferrer"` + descriptive `aria-label`

### 6.8 — Types re-export from shared
- Create `client/src/types/index.ts` re-exporting all types from `../../shared/types`
- All client components import types from `client/src/types/`, never directly from `shared/`
  (this preserves the module boundary)

---

## Implementation Notes

- **`chat()` SSE via fetch, not `EventSource`**: `EventSource` is GET-only (browser spec). Since
  `/api/chat` is a `POST` endpoint, the client uses `fetch()` + `ReadableStream` parsing instead.
  `chat(params, callbacks)` returns `{ close: () => void }` (backed by `AbortController`).
  The `onToken`, `onDone`, and `onError` callbacks replace event listener attachment.

- **`getPosterSiblings` returns `VisualSibling[]`**: The spec originally listed `PosterSummary[]`
  but the `get_visual_siblings` RPC returns `similarity_score`, not `overall_confidence`.
  The correct shared type is `VisualSibling` — used here to keep the types spec-accurate.

- **`getSeries` returns `SeriesPageResponse`**: The full shared type (includes `total`, `page`,
  `limit`) is used rather than the simplified `{ series, posters }` shape in the small bits list.

- **Types re-export path**: `client/src/types/index.ts` re-exports from `'@poster-pilot/shared'`
  (the workspace package name), not a relative file path.

- **`vite-env.d.ts` required**: Added `client/src/vite-env.d.ts` with
  `/// <reference types="vite/client" />` so `import.meta.env` types resolve in strict TypeScript.

- **Font imports in `main.tsx`**: `@fontsource-variable/*` packages ship CSS; they must be
  imported in `main.tsx` so Vite bundles the font files correctly.

---

## Testing Checkpoint

- ✅ `npm run dev:client` — app loads; all five routes render their stub content without errors
- ✅ Dark mode toggle: switches appearance; survives page refresh; new tab defaults to system preference
- ✅ `npm run typecheck` — client workspace compiles with zero errors
- ✅ `npm test` — 194 tests, all passing (no new automated tests; shell verified visually)
- ✅ `debug('test')` only logs in dev mode; nothing in `npm run build` production output
