import type {
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

export type ChatCallbacks = {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
};

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

  return res.json() as Promise<T>;
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
              if (payload === '[DONE]') {
                callbacks.onDone();
                return;
              }
              try {
                const parsed = JSON.parse(payload) as unknown;
                if (
                  parsed !== null &&
                  typeof parsed === 'object' &&
                  'token' in parsed &&
                  typeof (parsed as Record<string, unknown>).token === 'string'
                ) {
                  callbacks.onToken((parsed as { token: string }).token);
                }
              } catch {
                debug('SSE parse error — skipping frame', payload);
              }
            }
          }
        }
      }

      callbacks.onDone();
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
