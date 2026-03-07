# Phase 8 — Poster Detail & Series Pages

**Depends on**:
- [Phase 4 — Search API](./phase-4-search-api.md) (poster detail and siblings endpoints)
- [Phase 7 — Search UI](./phase-7-search-ui.md) (`PosterCard` and `ConfidenceIndicator` already built)

**Next phase**: [Phase 9 — Archivist Sidebar UI](./phase-9-archivist-ui.md)

---

## Definition of Done

- `PosterDetailPage` displays all metadata fields from the `posters` table
- The Visual Siblings horizontal scroll strip shows 5 posters with similarity percentages
- "How are these related?" button placeholder is wired (will be connected in Phase 9)
- `SeriesPage` displays a paginated browse grid for a single series
- `AboutPage` is complete with NARA attribution
- "← Back" breadcrumb navigation returns to the previous search results
- All pages are accessible (axe: no violations) and responsive across all three breakpoints
- "Open in NARA →" external link constructs the correct NARA catalog URL from `nara_id`

---

## Small Bits

### 8.1 — `VisualSiblings` component
- Props: `{ sourcePosterId: string; onHowRelated: (ids: string[]) => void }`
- Horizontal scroll strip — no JavaScript scroll library; native CSS `overflow-x: auto`
- Fetches siblings via `api.getPosterSiblings(sourcePosterId)` on mount
- Each sibling card: thumbnail + similarity percentage (e.g., "94% similar")
- "How are these related?" button: calls `onHowRelated([sourcePosterId, siblingId])`
  — wired to the Archivist in Phase 9; renders as a disabled button until then
- `aria-label` on the scroll container: "Visual siblings — posters with similar imagery"

### 8.2 — `PosterDetailPage`
Two-column layout per the wireframe in `UI_UX_SPEC.md`:

**Left column** (max 60% viewport width):
- Full-resolution poster image with `loading="lazy"`
- Alt text: `"{title}" — {creator}, {date_created}, NARA collection`

**Right column**:
- Title in Playfair Display (serif), large
- Creator | Date | Series — secondary text color
- Horizontal rule separator
- NARA description text
- Subject tags as pill badges (each tag links to `/search?q={tag}&mode=text`)
- Physical description (medium, dimensions)
- NARA Record number in monospace font
- "Open in NARA →" external link — constructs URL from `nara_id`
- Horizontal rule separator
- `ConfidenceIndicator` showing `overall_confidence`

Full-width below both columns:
- `VisualSiblings` component

### 8.3 — Breadcrumb and back navigation
- "← Back" link at the top of `PosterDetailPage` uses `useNavigate(-1)` to return to
  the previous search results (preserving scroll position is a nice-to-have, not required)
- Breadcrumb text: `{series_title} > {title}` (truncated if long)

### 8.4 — `SeriesPage`
- Header: series title (serif font) + series description
- `PosterGrid` in browse mode: `similarityScore` prop is undefined → no similarity badges shown
- Pagination via "Load 20 More" button calling `api.getSeries(slug, page)`
- Empty state if series has no posters yet

### 8.5 — `AboutPage`
- Static content (no API calls, no state)
- Sections: what Poster Pilot is, NARA attribution paragraph, link to NARA catalog,
  brief note about the CLIP + Claude technology stack
- All external links: `target="_blank" rel="noopener noreferrer"`

---

## Testing Checkpoint

- Navigate from a search result to a poster detail page — all metadata fields render correctly
- Visual Siblings load with correct similarity percentages
- "Open in NARA →" link points to a real, resolvable NARA catalog URL (spot-check manually)
- "← Back" returns to the search results with the previous query still displayed
- Browse `/series/wpa-posters` — paginated grid loads; "Load 20 More" appends results
- Resize to mobile — detail page stacks to single column; siblings strip scrolls horizontally
- `npm run typecheck` — clean; `npm test` — green
