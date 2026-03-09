import type { SearchResult } from '@poster-pilot/shared';
import PosterCard from './PosterCard.js';

interface PosterGridProps {
  results: SearchResult[];
  /** True while a loadMore fetch is in flight (skeleton is shown by the parent during initial load) */
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
}

export default function PosterGrid({
  results,
  loadingMore,
  hasMore,
  onLoadMore,
  onSelect,
}: PosterGridProps) {
  return (
    <section aria-label="Search results">
      {/* CSS masonry via columns — no JS library needed */}
      <div className="columns-2 gap-discovery md:columns-3 lg:columns-4">
        {results.map(({ poster, similarity_score }) => (
          <PosterCard
            key={poster.id}
            poster={poster}
            similarityScore={similarity_score}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* Load more / end-of-results */}
      {(hasMore || loadingMore) && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            aria-label="Load 20 more results"
            className="
              rounded-button border border-border bg-surface-2 px-6 py-2.5
              font-sans text-sm font-semibold text-text
              transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            "
          >
            {loadingMore ? 'Loading…' : 'Load 20 More'}
          </button>
        </div>
      )}
    </section>
  );
}
