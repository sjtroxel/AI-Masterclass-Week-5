import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@poster-pilot/shared';
import { HUMAN_HANDOFF_THRESHOLD } from '@poster-pilot/shared';
import * as api from '../lib/api.js';
import { debug } from '../lib/debug.js';

// ─── Constants — exported for unit testing ────────────────────────────────────

export const SESSION_KEY = 'archivist-session-id';

// ─── Pure helpers — exported for unit testing ─────────────────────────────────

/**
 * Builds a nara_id → poster UUID lookup map from an array of poster-like objects.
 * Used by pages to tell the Archivist context which posters are in view so that
 * citation links can resolve to the correct /poster/:uuid route.
 */
export function buildPosterIdMap(
  posters: Array<{ id: string; nara_id: string }>,
): Record<string, string> {
  return posters.reduce<Record<string, string>>((acc, p) => {
    acc[p.nara_id] = p.id;
    return acc;
  }, {});
}

// ─── Session ID initializer ───────────────────────────────────────────────────

function initSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, newId);
    return newId;
  } catch {
    // sessionStorage may be blocked in some iframe/private contexts
    return crypto.randomUUID();
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UseArchivistReturn = {
  messages: ChatMessage[];
  loading: boolean;
  sessionId: string;
  handoffNeeded: boolean;
  error: string | null;
  sendMessage: (text: string, posterContextIds: string[]) => void;
  resetSession: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useArchivist(): UseArchivistReturn {
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [loading, setLoading]           = useState(false);
  const [sessionId, setSessionId]       = useState<string>(initSessionId);
  const [handoffNeeded, setHandoffNeeded] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const streamRef  = useRef<{ close: () => void } | null>(null);
  // Ref used for the session-expiry retry (avoids stale closure in doSend).
  // React 19 requires an explicit initialValue for useRef — null used here.
  const doSendRef  = useRef<((
    text: string,
    posterContextIds: string[],
    currentSessionId: string,
    isRetry?: boolean,
  ) => void) | null>(null);

  const doSend = useCallback((
    text: string,
    posterContextIds: string[],
    currentSessionId: string,
    isRetry = false,
  ): void => {
    // Abort any in-flight stream before starting a new one
    streamRef.current?.close();
    setLoading(true);
    setError(null);

    // Optimistically append user message + empty assistant placeholder
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { role: 'user',      content: text, timestamp: now } satisfies ChatMessage,
      { role: 'assistant', content: '',   timestamp: now } satisfies ChatMessage,
    ]);

    const stream = api.chat(
      {
        message:             text,
        session_id:          currentSessionId,
        poster_context_ids:  posterContextIds,
      },
      {
        onToken: (delta) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + delta };
            }
            return copy;
          });
        },

        onDone: ({ citations, confidence }) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = {
                ...last,
                citations,
                confidence,
                handoff_suggested: confidence < HUMAN_HANDOFF_THRESHOLD,
              };
            }
            return copy;
          });
          setHandoffNeeded(confidence < HUMAN_HANDOFF_THRESHOLD);
          setLoading(false);
          debug('archivist stream done', { citations: citations.length, confidence });
        },

        onError: (err) => {
          // ── Spec 9.6: silent session recovery ──────────────────────────
          if (
            !isRetry &&
            err instanceof api.ApiStreamError &&
            err.code === 'SESSION_EXPIRED'
          ) {
            debug('archivist: session expired — recovering');
            // Remove the optimistically added user + placeholder messages
            setMessages((prev) => prev.slice(0, -2));
            const newId = crypto.randomUUID();
            try { sessionStorage.setItem(SESSION_KEY, newId); } catch { /* noop */ }
            setSessionId(newId);
            doSendRef.current?.(text, posterContextIds, newId, true);
            return;
          }
          // ── Remove empty assistant placeholder on error ─────────────────
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last?.role === 'assistant' && last.content === ''
              ? prev.slice(0, -1)
              : prev;
          });
          setError(err.message);
          setLoading(false);
          debug('archivist stream error', err.message);
        },
      },
    );

    streamRef.current = stream;
  }, []); // All state updates via stable setter functions — no deps needed

  // Keep ref current after every render so the recovery retry always calls
  // the latest version of doSend (avoids the stale-closure recursion problem).
  // useLayoutEffect runs synchronously after DOM mutations, before paint.
  useLayoutEffect(() => {
    doSendRef.current = doSend;
  });

  // Abort any open stream on unmount
  useEffect(() => {
    return () => { streamRef.current?.close(); };
  }, []);

  const sendMessage = useCallback((text: string, posterContextIds: string[]): void => {
    doSend(text, posterContextIds, sessionId);
  }, [doSend, sessionId]);

  const resetSession = useCallback((): void => {
    streamRef.current?.close();
    const newId = crypto.randomUUID();
    try { sessionStorage.setItem(SESSION_KEY, newId); } catch { /* noop */ }
    setSessionId(newId);
    setMessages([]);
    setHandoffNeeded(false);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, loading, sessionId, handoffNeeded, error, sendMessage, resetSession };
}
