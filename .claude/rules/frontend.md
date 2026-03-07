# Frontend Rules — client/**

These rules apply when working in the `client/` directory.

## React 19 Patterns
- Use function components exclusively — no class components.
- Server Components are NOT used in this project (Vite SPA, not Next.js).
- Prefer `use()` hook for async data in React 19 where appropriate; fall back to `useEffect` + state
  only when `use()` is not suitable.
- Custom hooks must start with `use` and live in `client/src/hooks/`.
- Colocate state as low in the tree as possible — avoid prop drilling beyond 2 levels by using context.

## Tailwind v4 (CSS-First)
- ALL design tokens are defined in `client/src/index.css` inside `@theme {}`.
- Never hardcode color hex values in component files — always reference `var(--color-*)` or
  Tailwind's generated utilities (e.g., `text-primary`, `bg-surface`).
- Dark mode is handled via the `.dark` class on `<html>` — tokens must define both light and dark
  variants inside `@theme {}` using `@variant dark {}`.
- Do NOT create a `tailwind.config.js` — it is incompatible with v4's CSS-first approach.

## TypeScript
- All component props must have explicit TypeScript interfaces defined above the component.
- Example:
  ```typescript
  interface PosterCardProps {
    poster: Poster;
    onSelect: (id: string) => void;
    similarityScore?: number; // optional — only shown for search results
  }
  ```
- Never use `React.FC<Props>` — use plain function with typed props directly.

## Component Organization
- One component per file; file name matches component name exactly (PascalCase).
- `pages/` components handle routing and data fetching only — no business logic.
- `components/` are purely presentational or lightly stateful UI units.
- The `ArchivistSidebar` component must NEVER call the Anthropic API directly — it uses
  `client/src/lib/api.ts` which proxies through Express.

## Anti-Patterns
- No inline `style={{}}` objects — use Tailwind utilities or CSS custom properties.
- No `useEffect` for derived state — compute it during render or with `useMemo`.
- No `console.log` in committed code — use the `debug` utility from `client/src/lib/debug.ts`.
- No direct `fetch()` calls in components — always use the typed API client in `client/src/lib/api.ts`.
