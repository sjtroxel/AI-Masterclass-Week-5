import { supabase } from '../lib/supabase.js';
import { DatabaseError, NotFoundError } from '../middleware/errorHandler.js';
import type {
  IngestPosterData,
  Poster,
  PosterSummary,
  Series,
  VisualSibling,
  SeriesPageResponse,
  QueryMode,
  HandoffReason,
} from '@poster-pilot/shared';
import { CLIP_EMBEDDING_DIMENSIONS, HUMAN_HANDOFF_THRESHOLD } from '@poster-pilot/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

// Explicit column list for all Poster fields — no SELECT *.
// The embedding column is intentionally excluded; it is large and never returned.
const POSTER_COLUMNS = [
  'id',
  'nara_id',
  'title',
  'date_created',
  'date_normalized',
  'creator',
  'description',
  'subject_tags',
  'series_title',
  'series_id',
  'physical_description',
  'reproduction_number',
  'rights_statement',
  'image_url',
  'thumbnail_url',
  'embedding_confidence',
  'metadata_completeness',
  'overall_confidence',
  'ingested_at',
  'last_updated_at',
  'ingest_version',
].join(', ');

// Lightweight column list for grid/list views — no embedding, no heavy text fields.
const POSTER_SUMMARY_COLUMNS =
  'id, nara_id, title, thumbnail_url, series_title, overall_confidence';

// Series columns — centroid vector is intentionally excluded (large, never returned to clients).
const SERIES_COLUMNS =
  'id, slug, title, description, nara_series_ref, poster_count, created_at';

// ─── Internal types ───────────────────────────────────────────────────────────

type ExistingPosterRow = { id: string; image_url: string };
// pgvector columns are returned by PostgREST as the text representation "[v1,v2,...]",
// not as a JSON array. The runtime type is string | null even though we model it as
// number[] | null for TypeScript purposes. parseEmbedding handles both forms.
type EmbeddingRow = { embedding: unknown };

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalises a pgvector value received from Supabase PostgREST into number[].
 *
 * PostgREST serialises the pgvector `vector` type as its text representation
 * "[v1,v2,...]" — a string, not a JSON array — even though the TypeScript type
 * we declared is `number[]`. This function handles both the string form
 * (runtime reality) and a pre-parsed number[] (unit-test mocks).
 *
 * Returns null if the value is missing, empty, or cannot be parsed.
 */
function parseEmbedding(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null;

  // Already a number[] (e.g., mocked in tests or future PostgREST behaviour).
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return raw.every((v) => typeof v === 'number') ? (raw as number[]) : null;
  }

  // pgvector text form: "[0.1,-0.2,...]"
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/^\[|\]$/g, '');
    if (trimmed.length === 0) return null;
    const parsed = trimmed.split(',').map(Number);
    return parsed.some(isNaN) ? null : parsed;
  }

  return null;
}

/**
 * Computes the element-wise mean of a set of 768-dimension embedding vectors.
 * Uses CLIP_EMBEDDING_DIMENSIONS from shared constants so the magic number
 * never appears inline.
 *
 * `?? 0` guards against noUncheckedIndexedAccess returning `number | undefined`.
 */
function computeCentroid(embeddings: number[][]): number[] {
  const count = embeddings.length;
  return Array.from({ length: CLIP_EMBEDDING_DIMENSIONS }, (_, d) =>
    embeddings.reduce((sum, emb) => sum + (emb[d] ?? 0), 0) / count,
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Inserts or updates a poster row keyed on `nara_id`.
 *
 * Embedding preservation rule (saves Replicate API costs):
 *  - If the poster already exists AND `image_url` is unchanged → update metadata only,
 *    leave the stored embedding untouched.
 *  - If the poster already exists AND `image_url` has changed → update everything
 *    including the new embedding.
 *  - If the poster does not exist → insert all fields including the embedding.
 *
 * Never returns the embedding in the result — the returned Poster type omits it.
 */
export async function upsertPoster(data: IngestPosterData): Promise<Poster> {
  // ── Step 1: Check for an existing row ───────────────────────────────────────
  const { data: existing, error: lookupError } = await supabase
    .from('posters')
    .select('id, image_url')
    .eq('nara_id', data.nara_id)
    .maybeSingle();

  if (lookupError) {
    throw new DatabaseError(
      `Failed to check poster existence for nara_id ${data.nara_id}: ${lookupError.message}`,
    );
  }

  const existingRow = existing as ExistingPosterRow | null;

  // ── Step 2a: New poster — INSERT ─────────────────────────────────────────────
  if (!existingRow) {
    const { data: inserted, error: insertError } = await supabase
      .from('posters')
      .insert(data)
      .select(POSTER_COLUMNS)
      .single();

    if (insertError || !inserted) {
      throw new DatabaseError(
        `Failed to insert poster ${data.nara_id}: ${insertError?.message ?? 'no data returned'}`,
      );
    }

    return inserted as unknown as Poster;
  }

  // ── Step 2b/2c: Existing poster — UPDATE ────────────────────────────────────
  // Destructure to isolate the embedding and nara_id.
  // nara_id is excluded from updates (it is the conflict key).
  // embedding is excluded when the image has not changed.
  const { embedding, nara_id: _naraId, ...metadataFields } = data;
  const imageChanged = existingRow.image_url !== data.image_url;
  const updatePayload = imageChanged ? { ...metadataFields, embedding } : metadataFields;

  const { data: updated, error: updateError } = await supabase
    .from('posters')
    .update(updatePayload)
    .eq('id', existingRow.id)
    .select(POSTER_COLUMNS)
    .single();

  if (updateError || !updated) {
    throw new DatabaseError(
      `Failed to update poster ${data.nara_id}: ${updateError?.message ?? 'no data returned'}`,
    );
  }

  return updated as unknown as Poster;
}

/**
 * Recomputes and stores the series centroid embedding.
 *
 * The centroid is the element-wise mean of all poster embeddings in the series.
 * It is used during ingest to compute per-poster `embedding_confidence` (cosine
 * similarity of the poster embedding to the series centroid).
 *
 * Skips the update (with a warning) if the series has no posters yet.
 */
export async function updateSeriesCentroid(seriesId: string): Promise<void> {
  // Fetch all embeddings for this series — the one valid case where we SELECT embedding.
  const { data: rows, error: fetchError } = await supabase
    .from('posters')
    .select('embedding')
    .eq('series_id', seriesId);

  if (fetchError) {
    throw new DatabaseError(
      `Failed to fetch embeddings for series ${seriesId}: ${fetchError.message}`,
    );
  }

  const embeddingRows = (rows ?? []) as EmbeddingRow[];
  const embeddings = embeddingRows
    .map((r) => parseEmbedding(r.embedding))
    .filter((e): e is number[] => e !== null);

  if (embeddings.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[posterService] No embeddings found for series ${seriesId} — skipping centroid update`,
    );
    return;
  }

  const centroid = computeCentroid(embeddings);

  const { error: updateError } = await supabase
    .from('series')
    .update({ centroid })
    .eq('id', seriesId);

  if (updateError) {
    throw new DatabaseError(
      `Failed to update centroid for series ${seriesId}: ${updateError.message}`,
    );
  }
}

// ─── Search event logging ──────────────────────────────────────────────────────

type LogSearchEventParams = {
  session_id: string;
  query_text: string | null;
  query_mode: QueryMode;
  result_poster_ids: string[];
  top_similarity_score: number | null;
  min_similarity_score: number | null;
  result_count: number;
  human_handoff_needed: boolean;
  handoff_reason: HandoffReason | null;
  latency_ms: number | null;
  clip_latency_ms: number | null;
  db_latency_ms: number | null;
};

/**
 * Inserts a row into `poster_search_events` for analytics and Human Handoff reporting.
 *
 * Fire-and-forget: this function is synchronous (returns void immediately).
 * The insert runs in the background and never delays the search response.
 * Failures are logged to stderr but never propagated to the caller.
 */
export function logSearchEvent(params: LogSearchEventParams): void {
  // Supabase's builder is PromiseLike (has .then) but not a full Promise (.catch is absent).
  // Wrapping in an async IIFE gives us a real Promise with proper error handling.
  void (async () => {
    try {
      await supabase.from('poster_search_events').insert({
        ...params,
        handoff_threshold_used: HUMAN_HANDOFF_THRESHOLD,
        human_handoff_triggered: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[posterService] logSearchEvent failed:', err);
    }
  })();
}

// ─── Poster read methods (Phase 4.6) ──────────────────────────────────────────

/**
 * Fetches a single poster by UUID.
 * Throws NotFoundError (→ HTTP 404) if no row exists for the given ID.
 * Never returns the embedding column.
 */
export async function getById(id: string): Promise<Poster> {
  const { data, error } = await supabase
    .from('posters')
    .select(POSTER_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch poster ${id}: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`Poster not found: ${id}`);
  }

  return data as unknown as Poster;
}

/**
 * Fetches paginated PosterSummary rows for a series, identified by its slug.
 * Throws NotFoundError if the slug does not match any series.
 * Results are ordered by overall_confidence descending (best matches first).
 */
export async function getBySeriesSlug(
  slug: string,
  page: number,
  limit: number,
): Promise<SeriesPageResponse> {
  // Step 1: Resolve series row by slug — never expose the centroid vector.
  const { data: seriesData, error: seriesError } = await supabase
    .from('series')
    .select(SERIES_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (seriesError) {
    throw new DatabaseError(`Failed to fetch series '${slug}': ${seriesError.message}`);
  }
  if (!seriesData) {
    throw new NotFoundError(`Series not found: ${slug}`);
  }

  const series = seriesData as unknown as Series;

  // Step 2: Fetch paginated poster summaries for this series.
  const offset = (page - 1) * limit;

  const {
    data: postersData,
    count,
    error: postersError,
  } = await supabase
    .from('posters')
    .select(POSTER_SUMMARY_COLUMNS, { count: 'exact' })
    .eq('series_id', series.id)
    .order('overall_confidence', { ascending: false })
    .range(offset, offset + limit - 1);

  if (postersError) {
    throw new DatabaseError(
      `Failed to fetch posters for series '${slug}': ${postersError.message}`,
    );
  }

  return {
    series,
    posters: (postersData ?? []) as unknown as PosterSummary[],
    total: count ?? 0,
    page,
    limit,
  };
}

/**
 * Calls the get_visual_siblings RPC to find visually similar posters.
 * The caller is responsible for verifying the source poster exists before calling this.
 * Returns up to 5 siblings ordered by visual similarity (cosine distance via pgvector).
 */
export async function getVisualSiblings(posterId: string): Promise<VisualSibling[]> {
  const { data, error } = await supabase.rpc('get_visual_siblings', {
    source_poster_id: posterId,
    sibling_count: 5,
  });

  if (error) {
    throw new DatabaseError(
      `get_visual_siblings RPC failed for poster ${posterId}: ${error.message}`,
    );
  }

  return (data ?? []) as VisualSibling[];
}
