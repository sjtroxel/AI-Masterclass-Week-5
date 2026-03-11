import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { ChatMessage } from '@poster-pilot/shared';
import { useArchivist } from '../hooks/useArchivist.js';

// ─── Constants — exported for unit testing ────────────────────────────────────

export const SIDEBAR_OPEN_KEY = 'archivist-open';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Maps nara_id → poster UUID. Populated by pages when their data loads. */
type PosterContext = {
  ids:    string[];
  idMap:  Record<string, string>;
  scores: Record<string, number>;
};

type ArchivistContextValue = {
  // Sidebar open/closed state (persisted in localStorage)
  isOpen:        boolean;
  openSidebar:   () => void;
  closeSidebar:  () => void;
  toggleSidebar: () => void;

  // Poster context — set by pages when their search results / poster data arrives
  posterContext:    PosterContext;
  setPosterContext: (ids: string[], idMap: Record<string, string>, scores: Record<string, number>) => void;

  // Chat state (delegated to useArchivist)
  messages:      ChatMessage[];
  loading:       boolean;
  handoffNeeded: boolean;
  error:         string | null;

  // Actions
  /**
   * Send a message to the Archivist.
   * `posterContextIds` overrides the stored page context for this message only
   * (used by "How are these related?" which passes exactly two poster IDs).
   * If omitted, the stored `posterContext.ids` are used.
   */
  sendMessage:  (text: string, posterContextIds?: string[]) => void;
  resetSession: () => void;
};

// ─── Context ─────────────────────────────────────────────────────────────────

const ArchivistContext = createContext<ArchivistContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ArchivistProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_OPEN_KEY) === 'true';
    } catch {
      return false; // localStorage blocked in some iframe / private contexts
    }
  });

  const [posterContext, setPosterContextState] = useState<PosterContext>({
    ids:    [],
    idMap:  {},
    scores: {},
  });

  const {
    messages, loading, handoffNeeded, error,
    sendMessage: archivistSend,
    resetSession,
  } = useArchivist();

  // ── Sidebar state ───────────────────────────────────────────────────────────

  const openSidebar = useCallback((): void => {
    setIsOpen(true);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, 'true'); } catch { /* noop */ }
  }, []);

  const closeSidebar = useCallback((): void => {
    setIsOpen(false);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, 'false'); } catch { /* noop */ }
  }, []);

  const toggleSidebar = useCallback((): void => {
    setIsOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_OPEN_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Poster context ──────────────────────────────────────────────────────────

  const setPosterContext = useCallback((
    ids:    string[],
    idMap:  Record<string, string>,
    scores: Record<string, number>,
  ): void => {
    setPosterContextState({ ids, idMap, scores });
  }, []);

  // ── sendMessage — falls back to stored poster context IDs ──────────────────

  const sendMessage = useCallback((
    text: string,
    posterContextIds?: string[],
  ): void => {
    const ids = posterContextIds ?? posterContext.ids.slice(0, 20);
    archivistSend(text, ids, posterContext.scores);
  }, [archivistSend, posterContext.ids, posterContext.scores]);

  return (
    <ArchivistContext.Provider
      value={{
        isOpen, openSidebar, closeSidebar, toggleSidebar,
        posterContext, setPosterContext,
        messages, loading, handoffNeeded, error,
        sendMessage, resetSession,
      }}
    >
      {children}
    </ArchivistContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useArchivistContext(): ArchivistContextValue {
  const ctx = useContext(ArchivistContext);
  if (!ctx) {
    throw new Error('useArchivistContext must be used within <ArchivistProvider>');
  }
  return ctx;
}
