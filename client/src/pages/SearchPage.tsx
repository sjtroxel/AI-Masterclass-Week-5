import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../hooks/useSearch.js';
import { useArchivistContext } from '../lib/archivistContext.js';
import { buildPosterIdMap } from '../hooks/useArchivist.js';
import SearchBar from '../components/SearchBar.js';
import PosterGrid from '../components/PosterGrid.js';
import HandoffBanner from '../components/HandoffBanner.js';
import SkeletonGrid from '../components/SkeletonGrid.js';
import EmptyState from '../components/EmptyState.js';
import ErrorState from '../components/ErrorState.js';

export default function SearchPage() {
  const navigate = useNavigate();
  const {
    query, mode, results, loading, error,
    handoffNeeded, handoffReason, hasMore,
    setQuery, setMode, submit, loadMore,
  } = useSearch();

  const { toggleSidebar, setPosterContext } = useArchivistContext();

  // Keep the Archivist's poster context in sync with current search results
  useEffect(() => {
    const ids    = results.map((r) => r.poster.id);
    const idMap  = buildPosterIdMap(results.map((r) => r.poster));
    const scores = Object.fromEntries(results.map((r) => [r.poster.id, r.similarity_score]));
    setPosterContext(ids, idMap, scores);
  }, [results, setPosterContext]);

  const showSkeleton = loading && results.length === 0;
  const showEmpty    = !loading && !error && results.length === 0 && query.trim().length > 0;
  const showResults  = results.length > 0;

  return (
    <main className="min-h-screen bg-surface px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl flex flex-col gap-8">
        {/* Search bar + Archivist toggle */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <SearchBar
              query={query}
              mode={mode}
              loading={loading}
              onQueryChange={setQuery}
              onModeChange={setMode}
              onSubmit={submit}
            />
          </div>

          {/* Archivist toggle — only visible when results exist */}
          {showResults && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Open The Archivist"
              title="Ask The Archivist about these results"
              className="
                mt-0.5 flex items-center gap-1.5 shrink-0
                rounded-button border border-border bg-surface-2
                px-3 py-2 font-sans text-sm text-text-muted
                transition-colors hover:bg-surface-3 hover:text-text
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
              "
            >
              {/* Book / archive icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              {/* Hide label on small screens — icon + title attr is enough */}
              <span className="hidden sm:inline">Ask Archivist</span>
            </button>
          )}
        </div>

        {/* Handoff banner — above results, never replaces them */}
        {handoffNeeded && showResults && (
          <HandoffBanner
            query={query}
            results={results}
            handoffReason={handoffReason}
          />
        )}

        {/* States */}
        {showSkeleton && <SkeletonGrid />}

        {showEmpty && <EmptyState />}

        {error && (
          <ErrorState message={error} onRetry={() => submit()} />
        )}

        {showResults && (
          <PosterGrid
            results={results}
            loadingMore={loading && results.length > 0}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onSelect={(id) => navigate(`/poster/${id}`)}
          />
        )}
      </div>
    </main>
  );
}
