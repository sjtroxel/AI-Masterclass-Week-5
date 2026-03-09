import type {
  Citation,
  Poster,
  SearchRequest,
  SearchResponse,
  SeriesPageResponse,
  VisualSibling,
} from '@poster-pilot/shared';
import { debug } from './debug.js';

// ─── Base URL ─────────────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

// ─── Chat types (client-side; mirrors the server's Zod schema) ────────────────

export type ChatParams = {
  message: string;
  session_id: string;
  poster_context_ids: string[];
  poster_similarity_scores?: Record<string, number>;
};

/** Payload delivered to `onDone` when the Archivist stream completes. */
export type DonePayload = {
  citations: Citation[];
  confidence: number;
};

export type ChatCallbacks = {
  onToken: (delta: string) => void;
  onDone: (payload: DonePayload) => void;
  onError: (err: Error) => void;
};

/**
 * Error class for SSE-level errors from /api/chat.
 * Carries an optional `code` string so callers can detect SESSION_EXPIRED
 * and perform silent session recovery (spec 9.6).
 */
export class ApiStreamError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiStreamError';
  }
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  debug('apiFetch', url, init?.method ?? 'GET');

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }

  const json = await res.json() as unknown;
  // All Express routes wrap their payload in { data: T } per backend.md convention.
  if (json !== null && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    return (json as { data: T }).data;
  }
  return json as T;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function search(request: SearchRequest): Promise<SearchResponse> {
  return apiFetch<SearchResponse>('/api/search', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ─── Posters ──────────────────────────────────────────────────────────────────

export function getPoster(id: string): Promise<Poster> {
  return apiFetch<Poster>(`/api/posters/${encodeURIComponent(id)}`);
}

/**
 * Returns visual siblings from the get_visual_siblings RPC.
 * Note: each sibling carries a `similarity_score`, not `overall_confidence`,
 * so the return type is VisualSibling[] (not PosterSummary[]).
 */
export function getPosterSiblings(id: string): Promise<VisualSibling[]> {
  return apiFetch<VisualSibling[]>(`/api/posters/${encodeURIComponent(id)}/siblings`);
}

// ─── Series ───────────────────────────────────────────────────────────────────

export function getSeries(slug: string, page: number): Promise<SeriesPageResponse> {
  const params = new URLSearchParams({ page: String(page) });
  return apiFetch<SeriesPageResponse>(`/api/series/${encodeURIComponent(slug)}?${params}`);
}

// ─── The Archivist — POST SSE stream ─────────────────────────────────────────
//
// EventSource is GET-only (browser spec). Since /api/chat is a POST endpoint
// that streams SSE, we use fetch() + ReadableStream parsing instead.
// Returns a { close } handle so the caller can abort the stream.

export function chat(params: ChatParams, callbacks: ChatCallbacks): { close: () => void } {
  const controller = new AbortController();

  void (async () => {
    try {
      debug('chat stream opening', params.session_id);

      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        callbacks.onError(new Error(`Chat API ${res.status}: ${text}`));
        return;
      }

      if (!res.body) {
        callbacks.onError(new Error('Chat response has no readable body'));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newlines
        const frames = buffer.split('\n\n');
        // Keep the last (potentially incomplete) frame in the buffer
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              // Legacy sentinel — kept for forward-compat; our server sends { done: true }
              if (payload === '[DONE]') {
                callbacks.onDone({ citations: [], confidence: 0 });
                return;
              }
              try {
                const parsed = JSON.parse(payload) as unknown;
                if (parsed !== null && typeof parsed === 'object') {
                  const obj = parsed as Record<string, unknown>;
                  if ('delta' in obj && typeof obj.delta === 'string') {
                    // Streaming token from the Archivist
                    callbacks.onToken(obj.delta);
                  } else if (obj.done === true) {
                    // Final event — carries citations and confidence score
                    const citations = Array.isArray(obj.citations)
                      ? (obj.citations as Citation[])
                      : [];
                    const confidence =
                      typeof obj.confidence === 'number' ? obj.confidence : 0;
                    callbacks.onDone({ citations, confidence });
                    return;
                  } else if ('error' in obj && typeof obj.error === 'string') {
                    // Server-side error propagated over the SSE stream
                    const code =
                      typeof obj.code === 'string' ? obj.code : undefined;
                    callbacks.onError(new ApiStreamError(obj.error, code));
                    return;
                  }
                }
              } catch {
                debug('SSE parse error — skipping frame', payload);
              }
            }
          }
        }
      }

      callbacks.onDone({ citations: [], confidence: 0 });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        debug('chat stream aborted');
        return;
      }
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return { close: () => controller.abort() };
}
