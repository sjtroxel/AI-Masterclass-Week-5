import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { VisualSibling } from '@poster-pilot/shared';
import * as api from '../lib/api.js';
import { debug } from '../lib/debug.js';

// ─── Pure helper — exported for unit testing ──────────────────────────────────

export function formatSimilarityPct(score: number): string {
  return `${Math.round(score * 100)}% similar`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisualSiblingsProps {
  sourcePosterId: string;
  onHowRelated: (ids: string[]) => void;
}

type FetchState = 'loading' | 'done' | 'error';

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

function SiblingSkeletons() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="w-44 shrink-0 flex flex-col gap-2">
          <div className="h-56 w-44 animate-pulse rounded-card bg-surface-2" />
          <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VisualSiblings({ sourcePosterId, onHowRelated }: VisualSiblingsProps) {
  const [siblings, setSiblings] = useState<VisualSibling[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  useEffect(() => {
    let cancelled = false;

    debug('VisualSiblings: fetching siblings for', sourcePosterId);

    api
      .getPosterSiblings(sourcePosterId)
      .then((data) => {
        if (cancelled) return;
        debug('VisualSiblings: received', data.length, 'siblings');
        setSiblings(data);
        setFetchState('done');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        debug('VisualSiblings: fetch error', err);
        setFetchState('error');
      });

    return () => { cancelled = true; };
  }, [sourcePosterId]);

  // Don't render the section while loading for the first time — show skeletons
  if (fetchState === 'loading') {
    return (
      <section aria-label="Visual siblings — posters with similar imagery" className="mt-10">
        <h2 className="mb-4 font-serif text-xl text-text">Visually Similar</h2>
        <SiblingSkeletons />
      </section>
    );
  }

  // On error or no siblings, silently omit the section
  if (fetchState === 'error' || siblings.length === 0) {
    return null;
  }

  return (
    <section aria-label="Visual siblings — posters with similar imagery" className="mt-10">
      <h2 className="mb-4 font-serif text-xl text-text">Visually Similar</h2>

      <div
        className="flex gap-4 overflow-x-auto pb-4"
        role="list"
        aria-label="Visually similar posters"
      >
        {siblings.map((sibling) => (
          <div
            key={sibling.id}
            role="listitem"
            className="w-44 shrink-0 flex flex-col gap-2"
          >
            {/* Thumbnail + title — navigates to sibling detail page */}
            <Link
              to={`/poster/${sibling.id}`}
              aria-label={`View poster: ${sibling.title}`}
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-card"
            >
              <img
                src={sibling.thumbnail_url}
                alt={`${sibling.title} — NARA collection`}
                loading="lazy"
                className="
                  w-full rounded-card object-cover
                  shadow-card transition-shadow duration-200
                  group-hover:shadow-card-hover
                "
              />
            </Link>

            <p className="font-sans text-xs font-semibold text-text line-clamp-2 leading-snug">
              {sibling.title}
            </p>

            <p className="font-mono text-xs text-text-muted">
              {formatSimilarityPct(sibling.similarity_score)}
            </p>

            {/* Phase 9 hook — disabled until Archivist sidebar is wired */}
            <button
              type="button"
              disabled
              onClick={() => onHowRelated([sourcePosterId, sibling.id])}
              aria-label={`Ask the Archivist how "${sibling.title}" is related`}
              title="Coming in Phase 9 — connects to The Archivist"
              className="
                w-full rounded-button border border-border bg-surface-2
                px-2 py-1.5 font-sans text-xs text-text-muted
                disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              How are these related?
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
