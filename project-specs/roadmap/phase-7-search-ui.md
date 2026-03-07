# Phase 7 — Search UI

**Depends on**:
- [Phase 4 — Search API](./phase-4-search-api.md) (real search results to render)
- [Phase 6 — Frontend Shell](./phase-6-frontend-shell.md) (design tokens, API client, routing)

**Next phase**: [Phase 8 — Detail & Series Pages](./phase-8-detail-pages.md)

---

## Definition of Done

- A user can type a text query and see results in a masonry grid with similarity score badges
- Confidence badge colors: green dot (≥ 0.85), amber dot (0.72–0.84), red dot (< 0.72)
- `HandoffBanner` appears above results when `handoff_needed: true`; "Request Expert Review"
  opens a pre-filled `mailto:` link; banner is dismissible
- Image search mode renders a dropzone accepting files ≤ 5MB
- Vibe mode shows the "Describe a feeling or aesthetic..." label
- Skeleton loading state matches the grid layout (no layout shift during load)
- Empty state: illustration + "Try a different query" + 3 suggested searches
- No infinite scroll — "Load 20 More" button only (keyboard accessible)
- Search query is synced to URL params (results are shareable and deep-linkable)
- Debounce is 300ms; `Enter` submits; `Escape` clears
- All components pass an axe accessibility check (no violations)

---

## Small Bits

### 7.1 — `ConfidenceIndicator` component
- Props: `{ score: number; showLabel?: boolean }`
- Renders a `<progress>` element + colored dot
- Color mapping: green (≥ 0.85), amber (0.72–0.84), red (< 0.72)
  — uses CSS custom properties, not hardcoded hex
- Accessible: `aria-label="Confidence score: {Math.round(score * 100)}%"`, `role="meter"`,
  `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
- Reused in: `PosterCard`, `PosterDetail`, `ArchivistSidebar`

Unit tests — `client/src/__tests__/ConfidenceIndicator.test.ts`:
- Score 0.90 → green class applied
- Score 0.78 → amber class applied
- Score 0.65 → red class applied

### 7.2 — `PosterCard` component
- Props: `{ poster: PosterSummary; similarityScore?: number; onSelect: (id: string) => void }`
- Lazy-loaded thumbnail: `<img loading="lazy" alt="{title} — {creator}, {date_created}, NARA collection">`
- Title truncated to 2 lines via CSS (`line-clamp-2`)
- Series badge below title
- Hover state: `scale-[1.02]` + `shadow-card-hover` + quick-action icon overlay
- Similarity score badge: only renders when `similarityScore` is defined
- Accessibility: `role="article"`, `aria-label="{title} by {creator}"`, `tabIndex={0}`
- `onSelect` fires on click AND on `Enter`/`Space` keydown

### 7.3 — `PosterGrid` component
- CSS masonry layout using `columns` property (no JavaScript masonry library)
- Responsive column count: 2 (mobile < 768px), 3 (tablet 768–1024px), 4 (desktop > 1024px)
- Gap: `--spacing-discovery` CSS custom property
- Renders `PosterCard` for each result
- "Load 20 More" button at the bottom — fires `onLoadMore` prop; hidden when no more results
- Skeleton state: renders 8 skeleton cards with pulse animation matching the grid layout

### 7.4 — `SearchBar` component
- Segmented control: `Text | Image | Hybrid | Vibe` — one button per mode
- Vibe mode: input placeholder changes to "Describe a feeling or aesthetic..."
- Image mode: renders a dropzone / URL paste area inline below the input
- Debounce: 300ms (implemented with `useCallback` + `useRef` for the timeout — no external lib)
- Keyboard: `Enter` → submit, `Escape` → clear input, `Tab` → cycles through modes
- Loading shimmer: animated gradient overlay on the search bar while a fetch is in progress
- Accessible: search input has `role="searchbox"`, mode buttons have descriptive `aria-label`

### 7.5 — `HandoffBanner` component (The Red Button)
- Only renders when `handoffNeeded === true`
- Visual: bordered panel with `--color-danger` left border, warning icon, explanation text
- "Request Expert Review" button: opens a `mailto:nara-reference@archives.gov` link
  pre-filled with:
  - Subject: "Poster Pilot — Expert Review Request"
  - Body: user's query + top 3 poster IDs + their similarity scores + handoff reason
- "Dismiss" link: sets `dismissed` local state; banner unmounts
- Accessibility: `role="alert"` so screen readers announce it on first appearance
- Never blocks the results grid below it — it is an invitation, not a wall

### 7.6 — Loading and empty states
- `SkeletonGrid`: 8 skeleton cards, pulse animation, matches real grid dimensions
- `EmptyState`: centered layout with icon + "Try a different query" heading +
  3 suggested search links: "WPA labor posters", "NASA moon mission",
  "WWII propaganda home front"
- `ErrorState`: inline error message + "Try again" button (no full-page error takeover)

### 7.7 — `useSearch` hook and `SearchPage`
- `client/src/hooks/useSearch.ts`
  - State: `query`, `mode`, `results`, `loading`, `error`, `handoffNeeded`, `page`
  - `submit()`: calls `api.search()`, updates state
  - `loadMore()`: increments page, appends results
  - Syncs `query` and `mode` to URL search params on every submit

- `client/src/pages/SearchPage.tsx`
  - Composes: `SearchBar` + `PosterGrid` + `HandoffBanner` + appropriate loading/empty/error states
  - On poster card `onSelect`: navigates to `/poster/:id`
  - Reads initial `q` and `mode` from URL params on mount

### 7.8 — Wire `HomePage`
- `client/src/pages/HomePage.tsx`
  - Full-page centered `SearchBar` with the wordmark above it
  - On submit: navigates to `/search?q=...&mode=...`

---

## Testing Checkpoint

- Manual E2E walkthrough:
  - Type a query → results appear → confidence badge colors are correct
  - Type a nonsense query → `handoffNeeded: true` → HandoffBanner appears
  - Click "Request Expert Review" → `mailto:` link opens with pre-filled content
  - Click "Dismiss" → banner disappears; results remain
  - Click a poster card → navigates to `/poster/:id` (stub page for now)
- Image upload mode: drop a test image → search fires → results load
- Resize to mobile → 2-column grid; tablet → 3-column; desktop → 4-column
- Keyboard-only: tab to search bar → type query → Enter → tab through results → Enter to select
- `npm test` — `ConfidenceIndicator` unit tests pass
- `npm run typecheck` — clean
