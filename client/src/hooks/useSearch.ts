import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HandoffReason, QueryMode, SearchResult } from '@poster-pilot/shared';
import * as api from '../lib/api.js';
import { debug } from '../lib/debug.js';

const PAGE_SIZE = 20;

type UseSearchReturn = {
  query: string;
  mode: QueryMode;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  handoffNeeded: boolean;
  handoffReason: HandoffReason | undefined;
  hasMore: boolean;
  setQuery: (q: string) => void;
  setMode: (m: QueryMode) => void;
  submit: (imageData?: string) => void;
  loadMore: () => void;
};

export function useSearch(): UseSearchReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery]               = useState<string>(searchParams.get('q') ?? '');
  const [mode, setMode]                 = useState<QueryMode>((searchParams.get('mode') as QueryMode) ?? 'text');
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [handoffNeeded, setHandoffNeeded] = useState(false);
  const [handoffReason, setHandoffReason] = useState<HandoffReason | undefined>(undefined);
  const [limit, setLimit]               = useState(PAGE_SIZE);

  // Stable ref to the latest query/mode/imageData so callbacks don't go stale
  const queryRef     = useRef(query);
  const modeRef      = useRef(mode);
  const imageDataRef = useRef<string | undefined>(undefined);

  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const hasMore = results.length >= limit && results.length > 0;

  // ─── Core fetch ─────────────────────────────────────────────────────────────

  const performSearch = useCallback(async (
    q: string,
    m: QueryMode,
    image: string | undefined,
    fetchLimit: number,
  ) => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();

    try {
      const request = {
        mode: m,
        limit: fetchLimit,
        ...(m !== 'image' && q ? { query: q } : {}),
        ...(( m === 'image' || m === 'hybrid') && image ? { image } : {}),
      };
      const response = await api.search(request);

      const latency = (performance.now() - t0).toFixed(0);
      debug(`search latency: ${latency}ms`, { mode: m, results: response.results.length });

      setResults(response.results);
      setHandoffNeeded(response.human_handoff_needed);
      setHandoffReason(response.handoff_reason);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Auto-run on mount if URL has a query ──────────────────────────────────

  const hasRunInitial = useRef(false);
  useEffect(() => {
    if (hasRunInitial.current) return;
    hasRunInitial.current = true;

    const initialQ = searchParams.get('q') ?? '';
    const initialM = (searchParams.get('mode') as QueryMode) ?? 'text';
    if (initialQ) {
      void performSearch(initialQ, initialM, undefined, PAGE_SIZE);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty — runs once on mount

  // ─── Submit (called by SearchBar after its own 300ms debounce) ─────────────

  const submit = useCallback((imageData?: string) => {
    const q = queryRef.current;
    const m = modeRef.current;
    imageDataRef.current = imageData;

    // Reset pagination on new search
    setLimit(PAGE_SIZE);
    setResults([]);

    // Sync to URL (replace so search submissions don't pile up in history)
    setSearchParams({ q, mode: m }, { replace: true });

    void performSearch(q, m, imageData, PAGE_SIZE);
  }, [performSearch, setSearchParams]);

  // ─── Load more ──────────────────────────────────────────────────────────────

  const loadMore = useCallback(() => {
    const nextLimit = limit + PAGE_SIZE;
    setLimit(nextLimit);
    void performSearch(queryRef.current, modeRef.current, imageDataRef.current, nextLimit);
  }, [limit, performSearch]);

  return {
    query, mode, results, loading, error,
    handoffNeeded, handoffReason, hasMore,
    setQuery, setMode, submit, loadMore,
  };
}
