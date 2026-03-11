import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@poster-pilot/shared';
import ConfidenceIndicator from './ConfidenceIndicator.js';

// ─── Pure helper — exported for unit testing ──────────────────────────────────

/**
 * Resolves a nara_id citation to a client navigation href.
 * - If the UUID is in the map, links to /poster/:uuid (correct detail page).
 * - Otherwise falls back to a text search, so the link is always useful.
 */
export function buildCitationHref(
  naraId: string,
  idMap: Record<string, string>,
): string {
  const uuid = idMap[naraId];
  return uuid
    ? `/poster/${uuid}`
    : `/search?q=${encodeURIComponent(naraId)}&mode=text`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArchivistMessageProps {
  message:      ChatMessage;
  posterIdMap:  Record<string, string>; // nara_id → poster UUID
  streaming?:   boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ArchivistMessage({
  message,
  posterIdMap,
  streaming = false,
}: ArchivistMessageProps) {
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`
          max-w-[85%] rounded-card px-3 py-2.5
          ${isAssistant
            ? 'bg-surface border border-border text-text'
            : 'bg-surface-3 text-text'
          }
        `}
        /* aria-live on assistant bubbles so screen readers announce new tokens */
        {...(isAssistant ? { 'aria-live': 'polite' as const, 'aria-atomic': false } : {})}
      >
        {/* Message text */}
        {isAssistant ? (
          <div className="font-sans text-sm leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>li]:mb-0.5 [&>strong]:font-semibold [&_strong]:font-semibold [&>h1]:font-semibold [&>h2]:font-semibold [&>h3]:font-semibold">
            {streaming && message.content === '' ? (
              <span
                className="inline-flex items-center gap-0.5"
                aria-label="The Archivist is thinking"
              >
                <span className="size-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" aria-hidden="true" />
                <span className="size-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" aria-hidden="true" />
                <span className="size-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" aria-hidden="true" />
              </span>
            ) : (
              <ReactMarkdown
                components={{
                  // Open external links safely; internal links are rare in Archivist output
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 underline decoration-dotted hover:text-primary-700"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        ) : (
          <p className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        )}

        {/* Citations — rendered only after streaming completes */}
        {!streaming && isAssistant && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
            <span className="w-full font-sans text-xs text-text-muted">Sources:</span>
            {message.citations.map((citation) => (
              <Link
                key={citation.nara_id}
                to={buildCitationHref(citation.nara_id, posterIdMap)}
                className="
                  font-mono text-xs text-primary-600 underline decoration-dotted
                  hover:text-primary-700
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded
                "
              >
                [{citation.nara_id}]
              </Link>
            ))}
          </div>
        )}

        {/* Confidence indicator — rendered only after streaming completes */}
        {!streaming && isAssistant && message.confidence !== undefined && (
          <div className="mt-2 border-t border-border pt-2">
            <ConfidenceIndicator score={message.confidence} showLabel />
          </div>
        )}
      </div>
    </div>
  );
}
