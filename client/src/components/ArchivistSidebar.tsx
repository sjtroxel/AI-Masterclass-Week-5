import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useArchivistContext } from '../lib/archivistContext.js';
import ArchivistMessage from './ArchivistMessage.js';

// ─── Constant — exported for unit testing ────────────────────────────────────

/** Pre-seeded question sent by the "How are these related?" button on VisualSiblings. */
export const RELATED_QUESTION = 'How are these two posters related?';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ArchivistSidebar() {
  const {
    isOpen, closeSidebar, toggleSidebar,
    posterContext,
    messages, loading, handoffNeeded, error,
    sendMessage, resetSession,
  } = useArchivistContext();

  const [draft, setDraft]       = useState('');
  const messagesEndRef           = useRef<HTMLDivElement>(null);
  const textareaRef              = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the bottom of the message list whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus the textarea when the sidebar opens
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => textareaRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [isOpen]);

  const handleSubmit = (): void => {
    const text = draft.trim();
    if (!text || loading) return;
    setDraft('');
    sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Index of the assistant message currently being streamed (-1 if none)
  const lastMsg       = messages[messages.length - 1];
  const streamingIndex = loading && lastMsg?.role === 'assistant'
    ? messages.length - 1
    : -1;

  return (
    <>
      {/* ── Toggle tab — always visible on the right edge of the viewport ── */}
      {/* On desktop (lg+): visible and shifts with sidebar (right-96 when open) */}
      {/* On mobile: hidden when sidebar is open (header close button handles it) */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close The Archivist' : 'Open The Archivist'}
        className={`
          fixed z-50 top-1/2 -translate-y-1/2
          flex items-center justify-center
          h-24 w-8
          rounded-l-button
          bg-primary-500 text-white
          shadow-card-hover
          hover:bg-primary-600
          transition-all duration-300
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
          ${isOpen ? 'right-96 hidden lg:flex' : 'right-0 flex'}
        `}
      >
        {/* Vertical "Archivist" label */}
        <span
          className="[writing-mode:vertical-rl] rotate-180 font-sans text-xs font-semibold tracking-wider select-none"
          aria-hidden="true"
        >
          Archivist
        </span>
      </button>

      {/* ── Mobile backdrop — closes sidebar on tap outside ─────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar panel ───────────────────────────────────────────────── */}
      <aside
        aria-label="The Archivist — AI research assistant"
        aria-hidden={!isOpen}
        // inert prevents keyboard focus on off-screen children (fixes axe aria-hidden-focus rule)
        // React 19 renders inert={true} as the empty presence attribute; inert={false} omits it.
        inert={!isOpen || undefined}
        className={`
          fixed right-0 top-0 z-50 h-full
          w-full lg:w-96
          flex flex-col
          bg-surface-2 border-l border-border
          shadow-card-hover
          transform transition-transform duration-300
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Archive / book icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary-500"
              aria-hidden="true"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <h2 className="font-serif text-base font-semibold text-text">The Archivist</h2>
          </div>

          <div className="flex items-center gap-1">
            {/* Reset / clear conversation */}
            <button
              type="button"
              onClick={resetSession}
              aria-label="Clear conversation"
              title="Clear conversation and start fresh"
              className="
                rounded p-1.5 text-text-muted
                hover:text-text hover:bg-surface-3
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
              "
            >
              {/* Rotate-left / reset icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            {/* Close (× button) */}
            <button
              type="button"
              onClick={closeSidebar}
              aria-label="Close The Archivist"
              className="
                rounded p-1.5 text-text-muted
                hover:text-text hover:bg-surface-3
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
              "
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Message list ────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-3"
          aria-live="polite"
          aria-label="Conversation with The Archivist"
        >
          {/* Empty state — shown before any messages */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-4 py-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-muted"
                aria-hidden="true"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              <p className="font-serif text-sm text-text-muted leading-relaxed">
                Ask me about the historical context, creators, or significance of any poster
                in the collection.
              </p>
              <p className="font-sans text-xs text-text-muted">
                {posterContext.ids.length > 0
                  ? `${posterContext.ids.length} poster${posterContext.ids.length > 1 ? 's' : ''} in context`
                  : 'Search for posters to add them to context'}
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <ArchivistMessage
              key={i}
              message={msg}
              posterIdMap={posterContext.idMap}
              streaming={i === streamingIndex}
            />
          ))}

          {/* Low-confidence handoff notice */}
          {handoffNeeded && (
            <div
              role="alert"
              className="
                flex items-start gap-2 rounded-card p-3
                border border-danger/30 bg-danger/5
                [border-left-width:3px] border-l-danger
              "
            >
              {/* Warning triangle */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
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
              <div>
                <p className="font-sans text-xs font-semibold text-text">
                  Low confidence results
                </p>
                <p className="mt-0.5 font-sans text-xs text-text-muted">
                  A human archivist can provide more precise assistance.{' '}
                  <a
                    href="mailto:nara-reference@archives.gov"
                    className="text-danger underline hover:opacity-80 focus-visible:outline-none"
                  >
                    Contact NARA
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div
              role="alert"
              className="rounded-card border border-danger/20 bg-danger/5 px-3 py-2"
            >
              <p className="font-sans text-xs text-danger">{error}</p>
            </div>
          )}

          {/* Invisible scroll anchor — scrollIntoView target */}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input area ──────────────────────────────────────────────────── */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about a poster's history…"
              rows={2}
              disabled={loading}
              aria-label="Message to The Archivist"
              className="
                flex-1 resize-none rounded-card border border-border bg-surface
                px-3 py-2 font-sans text-sm text-text
                placeholder:text-text-muted
                focus:outline-none focus:ring-2 focus:ring-primary-500
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || draft.trim().length === 0}
              aria-label="Send message"
              className="
                flex h-10 w-10 shrink-0 items-center justify-center
                rounded-button bg-primary-500 text-white
                transition-opacity hover:opacity-90
                disabled:opacity-40 disabled:cursor-not-allowed
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
              "
            >
              {/* Send / paper-plane icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 font-sans text-xs text-text-muted">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </aside>
    </>
  );
}
