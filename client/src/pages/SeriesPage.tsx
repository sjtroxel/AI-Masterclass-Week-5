import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PosterSummary, Series } from '@poster-pilot/shared';
import * as api from '../lib/api.js';
import { debug } from '../lib/debug.js';
import PosterCard from '../components/PosterCard.js';
import ErrorState from '../components/ErrorState.js';
import EmptyState from '../components/EmptyState.js';
import SkeletonGrid from '../components/SkeletonGrid.js';

type FetchState = 'loading' | 'done' | 'error';

export default function SeriesPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [series, setSeries] = useState<Series | null>(null);
  const [posters, setPosters] = useState<PosterSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const hasMore = posters.length < total;

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;
    debug('SeriesPage: fetching series', slug);

    api
      .getSeries(slug, 1)
      .then((data) => {
        if (cancelled) return;
        debug('SeriesPage: loaded series', data.series.title, 'total:', data.total);
        setSeries(data.series);
        setPosters(data.posters);
        setTotal(data.total);
        setLimit(data.limit);
        setPage(data.page);
        setFetchState('done');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load series';
        debug('SeriesPage: fetch error', msg);
        setErrorMsg(msg);
        setFetchState('error');
      });

    return () => { cancelled = true; };
  }, [slug, retryCount]);

  // ─── Load more ─────────────────────────────────────────────────────────────

  function handleLoadMore() {
    if (!slug || loadingMore || !hasMore) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    debug('SeriesPage: loading more, page', nextPage);

    api
      .getSeries(slug, nextPage)
      .then((data) => {
        setPosters((prev) => [...prev, ...data.posters]);
        setPage(data.page);
        setTotal(data.total);
        setLoadingMore(false);
      })
      .catch((err: unknown) => {
        debug('SeriesPage: loadMore error', err);
        setLoadingMore(false);
      });
  }

  // ─── States ────────────────────────────────────────────────────────────────

  if (fetchState === 'loading') {
    return (
      <main className="min-h-screen bg-surface pl-4 pr-10 py-8 md:pl-8 md:pr-12">
        <div className="mx-auto max-w-6xl flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-96 animate-pulse rounded bg-surface-2" />
          </div>
          <SkeletonGrid />
        </div>
      </main>
    );
  }

  if (fetchState === 'error') {
    return (
      <main className="min-h-screen bg-surface pl-4 pr-10 py-8 md:pl-8 md:pr-12">
        <div className="mx-auto max-w-6xl">
          <ErrorState
            message={errorMsg}
            onRetry={() => { setFetchState('loading'); setPosters([]); setRetryCount((c) => c + 1); }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface pl-4 pr-10 py-8 md:pl-8 md:pr-12">
      <div className="mx-auto max-w-6xl flex flex-col gap-8">

        {/* Series header */}
        {series && (
          <header className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl font-semibold text-text">
              {series.title}
            </h1>
            {series.description && (
              <p className="font-sans text-sm text-text-muted max-w-2xl">
                {series.description}
              </p>
            )}
            <p className="font-sans text-xs text-text-muted">
              {total} {total === 1 ? 'poster' : 'posters'} in this collection
            </p>
          </header>
        )}

        {/* Browse grid — masonry, no similarity badges */}
        {posters.length === 0 ? (
          <EmptyState />
        ) : (
          <section aria-label={`${series?.title ?? 'Series'} posters`}>
            <div className="columns-2 gap-discovery md:columns-3 lg:columns-4">
              {posters.map((poster) => (
                <PosterCard
                  key={poster.id}
                  poster={poster}
                  onSelect={(id) => navigate(`/poster/${id}`)}
                />
              ))}
            </div>

            {/* Load more / end-of-results */}
            {(hasMore || loadingMore) && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  aria-label={`Load ${limit} more posters`}
                  className="
                    rounded-button border border-border bg-surface-2 px-6 py-2.5
                    font-sans text-sm font-semibold text-text
                    transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                  "
                >
                  {loadingMore ? 'Loading…' : `Load ${limit} More`}
                </button>
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}
