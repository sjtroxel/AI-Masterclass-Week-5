import { useNavigate } from 'react-router-dom';
import { useSearch } from '../hooks/useSearch.js';
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

  const showSkeleton = loading && results.length === 0;
  const showEmpty    = !loading && !error && results.length === 0 && query.trim().length > 0;
  const showResults  = results.length > 0;

  return (
    <main className="min-h-screen bg-surface px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl flex flex-col gap-8">
        {/* Search bar */}
        <SearchBar
          query={query}
          mode={mode}
          loading={loading}
          onQueryChange={setQuery}
          onModeChange={setMode}
          onSubmit={submit}
        />

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
