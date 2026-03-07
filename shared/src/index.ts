// ─── Constants ────────────────────────────────────────────────────────────────

export const HUMAN_HANDOFF_THRESHOLD = 0.72;
export const CLIP_EMBEDDING_DIMENSIONS = 768;
export const CLIP_MODEL_ID = 'openai/clip-vit-large-patch14';
export const MAX_RAG_CONTEXT_POSTERS = 5;
export const ARCHIVIST_MAX_TOKENS = 8000;

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type QueryMode = 'text' | 'image' | 'hybrid' | 'vibe';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type Poster = {
  id: string;
  nara_id: string;
  title: string;
  date_created: string | null;
  creator: string | null;
  description: string | null;
  subject_tags: string[];
  series_title: string | null;
  thumbnail_url: string;
  image_url: string;
  overall_confidence: number;
};

export type Series = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  poster_count: number;
};

// ─── Search Types ─────────────────────────────────────────────────────────────

export type SearchResult = {
  poster: Poster;
  similarity_score: number;
  confidence_level: ConfidenceLevel;
};

export type SearchResponse = {
  results: SearchResult[];
  query_mode: QueryMode;
  human_handoff_needed: boolean;
  handoff_reason?: string;
};

// ─── API Response Types ───────────────────────────────────────────────────────

export type HealthResponse = {
  status: 'ok';
};

export type ApiError = {
  error: string;
  details?: string;
};
