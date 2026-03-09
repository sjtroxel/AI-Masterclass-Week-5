import { useState } from 'react';
import type { HandoffReason, SearchResult } from '@poster-pilot/shared';

interface HandoffBannerProps {
  query: string;
  results: SearchResult[];
  handoffReason: HandoffReason | undefined;
}

function buildMailto(query: string, results: SearchResult[], reason: HandoffReason | undefined): string {
  const top3 = results.slice(0, 3);
  const posterLines = top3
    .map(({ poster, similarity_score }) =>
      `  - ${poster.nara_id} "${poster.title}" (score: ${(similarity_score * 100).toFixed(1)}%)`
    )
    .join('\n');

  const body = [
    `Query: ${query}`,
    '',
    'Top results:',
    posterLines || '  (none)',
    '',
    `Reason: ${reason ?? 'low confidence'}`,
  ].join('\n');

  return (
    'mailto:nara-reference@archives.gov' +
    '?subject=' + encodeURIComponent('Poster Pilot — Expert Review Request') +
    '&body=' + encodeURIComponent(body)
  );
}

export default function HandoffBanner({ query, results, handoffReason }: HandoffBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="alert"
      aria-label="Low-confidence results — expert review available"
      className="
        flex gap-4 rounded-card border border-danger/30 bg-danger/5
        pl-4 pr-6 py-4
        [border-left-width:4px] [border-left-color:var(--color-danger)]
      "
    >
      {/* Warning icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-danger"
        aria-hidden="true"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>

      <div className="flex flex-1 flex-col gap-2">
        <p className="font-sans text-sm font-semibold text-text">
          I&apos;m not fully confident in these results.
        </p>
        <p className="font-sans text-xs text-text-muted">
          A human archivist can provide more precise assistance with your query.
          These results are still shown below — this is an invitation, not a wall.
        </p>
        <div className="flex items-center gap-4">
          <a
            href={buildMailto(query, results, handoffReason)}
            className="
              inline-block rounded-button bg-danger px-4 py-1.5
              font-sans text-sm font-semibold text-danger-text
              transition-opacity hover:opacity-90
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger
            "
          >
            Request Expert Review
          </a>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="
              font-sans text-xs text-text-muted underline
              hover:text-text focus-visible:outline-none
            "
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
