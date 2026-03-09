import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Poster } from '@poster-pilot/shared';
import * as api from '../lib/api.js';
import { debug } from '../lib/debug.js';
import { useArchivistContext } from '../lib/archivistContext.js';
import ConfidenceIndicator from '../components/ConfidenceIndicator.js';
import VisualSiblings from '../components/VisualSiblings.js';
import ErrorState from '../components/ErrorState.js';

// ─── Pure helpers — exported for unit testing ─────────────────────────────────

/**
 * Constructs a NARA catalog URL from a stored nara_id value.
 * Returns null for DPLA-format IDs (dpla-*) that have no direct NARA page.
 */
export function buildNaraUrl(naraId: string): string | null {
  const match = /^NAID-(\d+)$/.exec(naraId);
  return match ? `https://catalog.archives.gov/id/${match[1]}` : null;
}

/**
 * Formats a breadcrumb label truncated to `maxChars` characters.
 */
export function formatBreadcrumb(seriesTitle: string | null, title: string, maxChars = 60): string {
  const crumb = seriesTitle ? `${seriesTitle} › ${title}` : title;
  return crumb.length > maxChars ? `${crumb.slice(0, maxChars - 1)}…` : crumb;
}

// ─── Component ────────────────────────────────────────────────────────────────

type FetchState = 'loading' | 'done' | 'error';

export default function PosterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { openSidebar, sendMessage, setPosterContext } = useArchivistContext();

  const [poster, setPoster] = useState<Poster | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    debug('PosterDetailPage: fetching poster', id);

    api
      .getPoster(id)
      .then((data) => {
        if (cancelled) return;
        debug('PosterDetailPage: loaded', data.title);
        setPoster(data);
        setFetchState('done');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load poster';
        debug('PosterDetailPage: fetch error', msg);
        setErrorMsg(msg);
        setFetchState('error');
      });

    return () => { cancelled = true; };
  }, [id, retryCount]);

  // Sync this poster into the Archivist's context so the sidebar can reference it
  useEffect(() => {
    if (!poster) return;
    setPosterContext([poster.id], { [poster.nara_id]: poster.id });
  }, [poster, setPosterContext]);

  // "How are these related?" — opens sidebar and sends the pre-seeded question
  const handleHowRelated = useCallback((posterIds: string[]): void => {
    openSidebar();
    sendMessage('How are these two posters related?', posterIds);
  }, [openSidebar, sendMessage]);

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  if (fetchState === 'loading') {
    return (
      <main className="min-h-screen bg-surface px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 h-4 w-48 animate-pulse rounded bg-surface-2" />
          <div className="flex flex-col gap-8 md:flex-row">
            <div className="h-125 w-full animate-pulse rounded-card bg-surface-2 md:max-w-[60%]" />
            <div className="flex flex-1 flex-col gap-4">
              <div className="h-8 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
              <div className="h-px w-full bg-border" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-3 w-full animate-pulse rounded bg-surface-2" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────

  if (fetchState === 'error' || !poster) {
    return (
      <main className="min-h-screen bg-surface px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl">
          <ErrorState
            message={errorMsg || 'Poster not found.'}
            onRetry={() => { setFetchState('loading'); setRetryCount((c) => c + 1); }}
          />
        </div>
      </main>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const naraUrl = buildNaraUrl(poster.nara_id);
  const breadcrumb = formatBreadcrumb(poster.series_title, poster.title);
  const altText = [poster.title, poster.creator, poster.date_created, 'NARA collection']
    .filter(Boolean)
    .join(' — ');

  return (
    <main className="min-h-screen bg-surface px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl flex flex-col gap-8">

        {/* Breadcrumb / Back navigation */}
        <nav aria-label="Breadcrumb">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="
              inline-flex items-center gap-1.5 font-sans text-sm text-text-muted
              transition-colors hover:text-text
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded
            "
            aria-label="Go back to previous page"
          >
            {/* Left arrow */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            <span className="truncate max-w-xs">{breadcrumb}</span>
          </button>
        </nav>

        {/* Two-column layout */}
        <div className="flex flex-col gap-8 md:flex-row md:items-start">

          {/* Left column — full-resolution image */}
          <div className="md:max-w-[60%] w-full shrink-0">
            <img
              src={poster.image_url}
              alt={altText}
              loading="lazy"
              className="w-full rounded-card shadow-card-hover object-contain"
            />
          </div>

          {/* Right column — metadata */}
          <div className="flex flex-1 flex-col gap-4 min-w-0">

            {/* Title */}
            <h1 className="font-serif text-2xl font-semibold text-text leading-tight md:text-3xl">
              {poster.title}
            </h1>

            {/* Creator | Date | Series */}
            <p className="font-sans text-sm text-text-muted">
              {[poster.creator, poster.date_created, poster.series_title]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <hr className="border-border" />

            {/* Description */}
            {poster.description && (
              <p className="font-sans text-sm text-text leading-relaxed">
                {poster.description}
              </p>
            )}

            {/* Subject tags */}
            {poster.subject_tags.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Subject tags">
                {poster.subject_tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/search?q=${encodeURIComponent(tag)}&mode=text`}
                    className="
                      inline-block rounded-button bg-primary-100 px-2.5 py-1
                      font-sans text-xs text-primary-700
                      transition-colors hover:bg-primary-200
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    "
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Physical description */}
            {poster.physical_description && (
              <p className="font-sans text-xs text-text-muted">
                <span className="font-semibold text-text">Medium / dimensions: </span>
                {poster.physical_description}
              </p>
            )}

            {/* NARA record number */}
            <p className="font-sans text-xs text-text-muted">
              <span className="font-semibold text-text">NARA record: </span>
              <span className="font-mono">{poster.nara_id}</span>
            </p>

            {/* Open in NARA link — only shown for real NARA IDs */}
            {naraUrl && (
              <a
                href={naraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-flex items-center gap-1 font-sans text-sm font-semibold text-primary-600
                  transition-colors hover:text-primary-700
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded
                "
                aria-label={`Open "${poster.title}" in the NARA catalog (opens in a new tab)`}
              >
                Open in NARA
                {/* External link icon */}
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
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}

            <hr className="border-border" />

            {/* Confidence indicator */}
            <div className="flex flex-col gap-1">
              <span className="font-sans text-xs text-text-muted">Archival confidence</span>
              <ConfidenceIndicator score={poster.overall_confidence} showLabel />
            </div>

          </div>
        </div>

        {/* Full-width Visual Siblings strip */}
        <VisualSiblings
          sourcePosterId={poster.id}
          onHowRelated={handleHowRelated}
        />

      </div>
    </main>
  );
}
