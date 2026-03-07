# Phase 9 — Archivist Sidebar UI

**Depends on**:
- [Phase 5 — Archivist API](./phase-5-archivist-api.md) (`/api/chat` SSE endpoint must exist)
- [Phase 8 — Detail & Series Pages](./phase-8-detail-pages.md) (all page components must be in place)

**Next phase**: [Phase 10 — Hardening & Deployment](./phase-10-hardening.md)

---

## Definition of Done

- `ArchivistSidebar` renders as a persistent panel on desktop (> 1024px) and a
  drawer overlay on mobile (< 1024px)
- Sidebar open/closed state persists in `localStorage` across page navigations
- Messages stream word-by-word via SSE; no skeleton loading — streaming starts immediately
- Citations render as clickable inline links to `/poster/:id`
- `ConfidenceIndicator` appears below each assistant response
- When `handoff_needed` is true from the Archivist response, `HandoffBanner` renders
  inside the sidebar
- "How are these related?" button on `VisualSiblings` opens the sidebar and sends a
  pre-seeded question about the two posters
- `session_id` is a UUID stored in `sessionStorage` (cleared on tab close = clean slate)
- The Anthropic API is never called from any client file — all calls route through `/api/chat`

---

## Small Bits

### 9.1 — `useArchivist` hook
`client/src/hooks/useArchivist.ts`

State managed: `messages: ChatMessage[]`, `loading: boolean`, `sessionId: string`,
`handoffNeeded: boolean`

- `sessionId` initialization: `sessionStorage.getItem('archivist-session-id')` on mount;
  if absent, generate with `crypto.randomUUID()` and write to `sessionStorage`
- `sendMessage(message: string, posterContextIds: string[])`:
  1. Optimistically append the user message to `messages`
  2. Open `EventSource` via `api.chat({ message, session_id, poster_context_ids })`
  3. On each `message` event: append delta to the latest assistant message in state
  4. On the `done` event: update citations and confidence on the assistant message;
     close the `EventSource`; set `handoffNeeded` if confidence indicates it
  5. On `error` event: set error state; close `EventSource`
- `resetSession()`: clears `sessionStorage`, generates a new UUID, clears `messages`

### 9.2 — `ArchivistMessage` component
- Props: `{ message: ChatMessage; streaming?: boolean }`
- User messages: right-aligned bubble, `--color-surface-2` background
- Assistant messages: left-aligned, `--color-surface` background
- Streaming indicator: animated ellipsis visible while `streaming === true`
- `aria-live="polite"` on the assistant message container so screen readers announce updates
- Citations: inline `<Link to="/poster/{nara_id}">[{nara_id}]</Link>` using React Router
- `ConfidenceIndicator` below assistant message (hidden during streaming; shown on `done`)

### 9.3 — `ArchivistSidebar` component
- Layout: fixed right panel on desktop (`w-96`), full-screen drawer on mobile
- Toggle button: always visible, `aria-expanded` state reflects open/closed
- `localStorage` key `archivist-open` persists state across navigations
- Message list: scrollable container; `useEffect` auto-scrolls to bottom on new message
  using `ref.current.scrollIntoView({ behavior: 'smooth' })`
- Input: `<textarea>` with `onKeyDown` — `Enter` submits, `Shift+Enter` adds newline
- Send button: disabled while `loading` is true
- When `handoffNeeded` is true: renders `HandoffBanner` at the bottom of the message list
  (above the input)

### 9.4 — Wire Archivist into `SearchPage`
- Pass current search result poster IDs as `posterContextIds` to `useArchivist`
- Sidebar toggle button appears in the page header area
- Opening the sidebar on a fresh search pre-populates context automatically

### 9.5 — Wire Archivist into `PosterDetailPage`
- Pass `[currentPosterId, ...siblingIds]` as `posterContextIds`
- "How are these related?" button on `VisualSiblings`:
  1. Opens the sidebar (sets `localStorage` key to open)
  2. Calls `sendMessage("How are these two posters related?", [sourcePosterId, siblingId])`
  3. Pre-seeds the context with both poster IDs

### 9.6 — Expired session recovery
- If `/api/chat` returns a session expiration error (`ValidationError` with code `SESSION_EXPIRED`):
  1. Call `resetSession()` to generate a new `session_id`
  2. Silently retry the same message once with the new session ID
  3. If the retry also fails, surface the error in the UI

---

## Testing Checkpoint

- Manual flow: search → open Archivist → type a question → response streams word-by-word →
  final message shows citations as clickable links → confidence indicator appears
- Click a citation link → navigates to correct `/poster/:id` page
- Close sidebar → `localStorage` reflects closed; refresh → sidebar stays closed
- Open a new tab → new `session_id` is generated (`sessionStorage` is tab-scoped)
- Navigate to a poster detail → "How are these related?" → sidebar opens → pre-seeded
  message fires → Archivist responds about both posters
- Simulate low confidence (use a poster with `overall_confidence < 0.72`) → HandoffBanner
  appears inside the sidebar
- `npm run typecheck` — clean; `npm test` — green
