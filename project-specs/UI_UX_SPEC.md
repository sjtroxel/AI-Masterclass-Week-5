# Poster Pilot — UI/UX Specification

## Design Philosophy

Poster Pilot is a Discovery Engine, not a search engine. The difference:
- A search engine retrieves what you asked for.
- A Discovery Engine surfaces what you didn't know you were looking for.

The UI must feel like wandering the stacks of a beautifully curated archive —
serendipitous, visually rich, intellectually engaging. Contrast this with the cold,
utilitarian UI of most archival databases. Poster Pilot is an invitation.

---

## Tailwind v4 Theme (CSS-First Configuration)

All design tokens live in `client/src/index.css`. There is no `tailwind.config.js`.

```css
/* client/src/index.css */

@import "tailwindcss";

@theme {
  /* === Typography === */
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-serif: 'Fraunces Variable', Georgia, serif;
  --font-mono: 'JetBrains Mono Variable', 'Fira Code', monospace;

  /* === Color Palette — Light Mode === */

  /* Primary: Deep archival amber */
  --color-primary-50:  oklch(97% 0.02 70);
  --color-primary-100: oklch(93% 0.05 70);
  --color-primary-200: oklch(85% 0.10 70);
  --color-primary-300: oklch(75% 0.15 70);
  --color-primary-400: oklch(65% 0.18 70);
  --color-primary-500: oklch(55% 0.20 70);   /* Brand amber — main CTAs */
  --color-primary-600: oklch(45% 0.18 70);
  --color-primary-700: oklch(35% 0.15 70);
  --color-primary-800: oklch(25% 0.10 70);
  --color-primary-900: oklch(15% 0.05 70);

  /* Neutral: Warm paper whites and archival grays */
  --color-surface:     oklch(98% 0.005 75);  /* page background */
  --color-surface-2:   oklch(95% 0.008 75);  /* card backgrounds */
  --color-surface-3:   oklch(92% 0.010 75);  /* hover states */
  --color-border:      oklch(85% 0.010 75);
  --color-text:        oklch(20% 0.010 75);  /* primary text */
  --color-text-muted:  oklch(45% 0.010 75);  /* secondary text */

  /* Accent: WPA-inspired red for The Red Button only */
  --color-danger:      oklch(52% 0.22 25);   /* Red Button — Human Handoff */
  --color-danger-text: oklch(98% 0.01 25);

  /* Success: Confidence indicator green */
  --color-success:     oklch(55% 0.18 145);

  /* Warning: Medium confidence amber */
  --color-warning:     oklch(65% 0.18 70);

  /* === Spacing === */
  --spacing-discovery: 1.5rem;  /* consistent gap in the poster grid */

  /* === Border Radius === */
  --radius-card:   0.375rem;    /* subtle, not bubbly — archival feel */
  --radius-button: 0.25rem;

  /* === Shadows === */
  --shadow-card: 0 1px 3px 0 oklch(0% 0 0 / 0.08), 0 1px 2px -1px oklch(0% 0 0 / 0.06);
  --shadow-card-hover: 0 4px 12px 0 oklch(0% 0 0 / 0.12);
}

/* === Dark Mode Overrides === */
/* Applied via .dark class on <html> set by Header.tsx dark mode toggle — not a media query. */
.dark {
    --color-surface:     oklch(12% 0.010 250);  /* near-black with cool undertone */
    --color-surface-2:   oklch(17% 0.012 250);
    --color-surface-3:   oklch(22% 0.014 250);
    --color-border:      oklch(30% 0.015 250);
    --color-text:        oklch(93% 0.005 75);
    --color-text-muted:  oklch(65% 0.008 75);
    /* Primary and accent remain — they're identity colors */
}
```

### Typography Scale
- **Display** (`font-serif`): Used ONLY for the site wordmark and poster titles in detail view
- **Headings** (`font-sans`, weight 600–700): Section labels, search result counts
- **Body** (`font-sans`, weight 400): Metadata, descriptions, Archivist responses
- **Mono** (`font-mono`): NARA record IDs, confidence scores in developer/debug mode

---

## Interface Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Wordmark | Search Bar (center, dominant) | Dark Toggle  │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │                              │
│   DISCOVERY GRID                 │   ARCHIVIST SIDEBAR          │
│   (masonry poster grid)          │   (collapsible, right)       │
│                                  │                              │
│   ┌────┐ ┌────┐ ┌────┐           │   ┌──────────────────────┐  │
│   │    │ │    │ │    │           │   │ Chat history         │  │
│   │    │ │    │ └────┘           │   │                      │  │
│   └────┘ │    │ ┌────┐           │   │ ...                  │  │
│   ┌────┐ └────┘ │    │           │   │                      │  │
│   │    │ ┌────┐ └────┘           │   └──────────────────────┘  │
│   └────┘ │    │                  │   [Input] [Send]             │
│          └────┘                  │                              │
│                                  │   ──── CONFIDENCE LOW ────   │
│   [Load More]                    │   🔴 Request Expert Review   │
│                                  │   (THE RED BUTTON)           │
└──────────────────────────────────┴──────────────────────────────┘
│  FOOTER: About | NARA Link | Feedback                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Inventory

### `SearchBar`
- Center-dominant placement in the header — the primary entry point
- Supports all 4 modes via a segmented control: `Text` | `Image` | `Hybrid` | `Vibe`
- Vibe mode shows a subtle label: "Describe a feeling or aesthetic..."
- Image mode shows a dropzone / URL paste area inline
- Debounce: 300ms before firing the search API call
- Keyboard: `Enter` submits; `Escape` clears; `Tab` cycles modes
- Shows a loading shimmer on the search bar during fetch

### `PosterGrid`
- Masonry layout (CSS `columns`, not JavaScript) — 2 cols mobile, 3 tablet, 4 desktop
- Each card: thumbnail image (lazy loaded), title (truncated to 2 lines), series badge
- Hover state: slight scale (1.02x), shadow increase, overlay with quick-action icons
- Click: navigates to `/poster/:id` detail view
- Similarity score badge: only shown on search results (not browse)
  - Green dot (≥ 0.85), amber dot (0.72–0.84), red dot (< 0.72)

### `PosterCard`
- Props: `{ poster: Poster, similarityScore?: number, onSelect: (id) => void }`
- Images use `loading="lazy"` and a blurred placeholder (matches dominant color from NARA thumbnail)
- A11y: `role="article"`, `aria-label="{title} by {creator}"`, keyboard focusable

### `PosterDetail` (full-page route `/poster/:id`)
Layout:
```
┌─────────────────────────────────────────────┐
│  [← Back]  Breadcrumb: Series > Title       │
├─────────────────┬───────────────────────────┤
│  Full Image     │  Title (serif, large)      │
│  (max 60% vw)  │  Creator | Date | Series   │
│                 │  ─────────────────────    │
│                 │  NARA Description          │
│                 │  Subject Tags (pills)       │
│                 │  Physical Description      │
│                 │  NARA Record: {nara_id}    │
│                 │  [Open in NARA →]          │
│                 │  ─────────────────────    │
│                 │  Confidence: ████░░ 74%    │
└─────────────────┴───────────────────────────┘
│  VISUAL SIBLINGS (horizontal scroll strip)  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│  │    │ │    │ │    │ │    │ │    │        │
│  └────┘ └────┘ └────┘ └────┘ └────┘        │
│  Similarity: 94%  92%  89%  85%  81%       │
└─────────────────────────────────────────────┘
```

### `VisualSiblings`
- Horizontal scroll strip showing 5 "Visual Siblings" from `get_visual_siblings` RPC
- Each sibling card shows thumbnail + similarity percentage
- "How are these related?" button opens The Archivist pre-seeded with both posters in context

### `ArchivistSidebar`
- Collapsible right panel — default open on desktop, closed on mobile
- `open` state stored in `localStorage` (survives page navigation)
- Streaming support: responses appear word-by-word via SSE
- Citations rendered as inline links to `PosterDetail` (`[WPA-1942-003]`)
- Confidence indicator below each response: colored bar (green/amber/red)
- Auto-scrolls to latest message

### `HandoffBanner` (The Red Button)
- Renders ONLY when `handoff_needed === true` in search results OR Archivist flags uncertainty
- Visual design: bordered panel with WPA-red left border, icon, explanation text
- CTA button: "Request Expert Review" — opens `mailto:` with pre-filled context
- NEVER intrusive — it is an invitation, not a wall
- Includes a "Dismiss" option if user wants to proceed with low-confidence results

### `ConfidenceIndicator`
- Reusable component: `{ score: number, showLabel?: boolean }`
- Renders a horizontal bar (`<progress>` element) + colored dot
- Accessible: `aria-label="Confidence score: {score}%"`, `role="meter"`
- Used in: `PosterCard`, `PosterDetail`, `ArchivistSidebar`

---

## Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `HomePage` | Search bar + browse grid (featured/recent) |
| `/search` | `SearchPage` | Results grid + optional Archivist sidebar |
| `/poster/:id` | `PosterDetailPage` | Full detail + Visual Siblings |
| `/series/:slug` | `SeriesPage` | Browse all posters in a series |
| `/about` | `AboutPage` | Project description + NARA credit |

---

## Responsive Behavior

| Breakpoint | Grid | Sidebar | Notes |
|-----------|------|---------|-------|
| Mobile (`< 768px`) | 2 columns | Hidden (toggle button) | Search bar full width |
| Tablet (`768–1024px`) | 3 columns | Drawer overlay | Search + filter on same row |
| Desktop (`> 1024px`) | 4 columns | Persistent right panel | Masonry optimal |

---

## Dark Mode

- Toggled via a sun/moon icon button in the header
- Persists via `localStorage` → sets `class="dark"` on `<html>`
- Respects `prefers-color-scheme` as the initial default (before user sets preference)
- All Tailwind utilities automatically switch via the CSS custom property overrides
- Images are NOT inverted in dark mode (preserving archival poster authenticity)

---

## Accessibility Requirements

- WCAG 2.1 AA minimum compliance
- All interactive elements: focus-visible ring using `ring-2 ring-primary-500`
- Color contrast: `text` on `surface` ≥ 7:1 in both modes
- The Archivist streaming text: `aria-live="polite"` on the message container
- Image alt text: `"{title}" — {creator}, {date_created}, NARA collection`
- Keyboard navigation: full grid navigation with arrow keys (future v2)
- The Red Button / HandoffBanner: `role="alert"` (announces to screen readers when it appears; `alertdialog` is reserved for interactive modal dialogs)

---

## Loading & Empty States

| State | Treatment |
|-------|-----------|
| Initial search | Skeleton cards (match grid layout) |
| No results | Illustration + "Try a different query" + 3 suggested searches |
| Low confidence results | Results shown + HandoffBanner above grid |
| Archivist thinking | Animated ellipsis + "Consulting the archive..." |
| Error | Inline error message with retry button (no full-page error) |
| Image upload processing | Progress bar + "Analyzing image..." label |

---

## Interaction Patterns to Avoid

- **No modal dialogs** for poster details — use a full-page route (`/poster/:id`)
- **No infinite scroll auto-load** — use a manual "Load 20 More" button (better for accessibility
  and avoids surprise CLIP embedding costs from bulk loading)
- **No toast notifications** for routine actions — only for errors and handoff triggers
- **No skeleton loading for the Archivist** — start streaming immediately; delay feels worse
  than instant partial text
