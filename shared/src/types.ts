// ─── Primitives ───────────────────────────────────────────────────────────────

export type QueryMode = 'text' | 'image' | 'hybrid' | 'vibe';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type HandoffReason = 'low_similarity' | 'low_confidence' | 'archivist_uncertain';

// ─── Domain: Series ───────────────────────────────────────────────────────────

export type Series = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  nara_series_ref: string | null;
  poster_count: number;
  created_at: string;
};

// ─── Domain: Posters ──────────────────────────────────────────────────────────

/** Full poster row — used for the detail page. Never includes the embedding vector. */
export type Poster = {
  id: string;
  nara_id: string;
  title: string;
  date_created: string | null;
  date_normalized: string | null;
  creator: string | null;
  description: string | null;
  subject_tags: string[];
  series_title: string | null;
  series_id: string | null;
  physical_description: string | null;
  reproduction_number: string | null;
  rights_statement: string | null;
  image_url: string;
  thumbnail_url: string;
  embedding_confidence: number;
  metadata_completeness: number;
  overall_confidence: number;
  ingested_at: string;
  last_updated_at: string;
  ingest_version: number;
};

/**
 * Data required to ingest (insert or update) a poster.
 * Includes the embedding vector — unlike Poster, which never exposes it.
 * Auto-generated fields (id, ingested_at, last_updated_at) are omitted.
 */
export type IngestPosterData = {
  nara_id: string;
  title: string;
  date_created: string | null;
  date_normalized: string | null;
  creator: string | null;
  description: string | null;
  subject_tags: string[];
  series_title: string | null;
  series_id: string | null;
  physical_description: string | null;
  reproduction_number: string | null;
  rights_statement: string | null;
  image_url: string;
  thumbnail_url: string;
  embedding: number[];
  embedding_confidence: number;
  metadata_completeness: number;
  overall_confidence: number;
  ingest_version: number;
};

/** Lightweight poster — used for grid/list views where full metadata is not needed. */
export type PosterSummary = {
  id: string;
  nara_id: string;
  title: string;
  thumbnail_url: string;
  series_title: string | null;
  overall_confidence: number;
};

/**
 * Poster result row returned by the match_posters RPC function.
 * Mirrors the RETURNS TABLE definition exactly.
 */
export type PosterResult = {
  id: string;
  nara_id: string;
  title: string;
  date_created: string | null;
  creator: string | null;
  thumbnail_url: string;
  series_title: string | null;
  overall_confidence: number;
  similarity_score: number;
};

// ─── Search ───────────────────────────────────────────────────────────────────

export type SearchRequest = {
  query?: string;   // required for text, vibe, hybrid; absent for image-only
  image?: string;   // base64 data URI or HTTPS URL; required for image and hybrid
  mode: QueryMode;
  series_filter?: string;
  limit?: number;
};

export type SearchResult = {
  poster: PosterResult;
  similarity_score: number;
  confidence_level: ConfidenceLevel;
};

export type SearchResponse = {
  results: SearchResult[];
  query_mode: QueryMode;
  human_handoff_needed: boolean;
  handoff_reason?: HandoffReason;
};

export type SearchEvent = {
  id: string;
  session_id: string;
  query_text: string | null;
  query_mode: QueryMode;
  result_poster_ids: string[];
  top_similarity_score: number | null;
  min_similarity_score: number | null;
  result_count: number;
  human_handoff_needed: boolean;
  human_handoff_triggered: boolean;
  handoff_reason: HandoffReason | null;
  handoff_threshold_used: number;
  latency_ms: number | null;
  created_at: string;
};

// ─── The Archivist ────────────────────────────────────────────────────────────

export type Citation = {
  nara_id: string;
  field: string;
  value: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: string;
  confidence?: number;
  handoff_suggested?: boolean;
};

export type ArchivistResponse = {
  message: ChatMessage;
  human_handoff_needed: boolean;
  handoff_reason?: HandoffReason;
  retrieved_poster_ids: string[];
};

// ─── Poster detail endpoints ──────────────────────────────────────────────────

/**
 * Row returned by the get_visual_siblings RPC function.
 * Mirrors the RETURNS TABLE definition exactly — subset of PosterResult.
 */
export type VisualSibling = {
  id: string;
  nara_id: string;
  title: string;
  thumbnail_url: string;
  similarity_score: number;
};

/** Response shape for GET /api/series/:slug. */
export type SeriesPageResponse = {
  series: Series;
  posters: PosterSummary[];
  total: number;
  page: number;
  limit: number;
};

export type ArchivistSession = {
  id: string;
  session_id: string;
  messages: ChatMessage[];
  poster_context: string[];           // UUID[] — poster IDs currently in context
  turn_count: number;
  total_tokens: number;               // cumulative token usage for budget tracking
  archivist_expressed_uncertainty: boolean;
  handoff_prompted_at: string | null; // ISO8601 or null
  created_at: string;
  updated_at: string;
  expires_at: string;
};

// ─── API Envelope ─────────────────────────────────────────────────────────────

export type HealthResponse = {
  status: 'ok';
  db: 'connected';
  timestamp: string;
};

export type ApiError = {
  error: string;
  details?: string;
};
