import { generateTextEmbedding, generateImageEmbedding } from './clipService.js';
import { expandVibeQuery, type QueryAnalysis } from './queryAnalyzer.js';
import { logSearchEvent } from './posterService.js';
import { reciprocalRankFusion } from '../lib/rankFusion.js';
import { supabase } from '../lib/supabase.js';
import { DatabaseError } from '../middleware/errorHandler.js';
import {
  HUMAN_HANDOFF_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
} from '@poster-pilot/shared';
import type {
  SearchResponse,
  SearchResult,
  PosterResult,
  QueryMode,
  ConfidenceLevel,
  HandoffReason,
} from '@poster-pilot/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

/** overall_confidence below this triggers a 'low_confidence' handoff (per database.md). */
const AI_CONFIDENCE_HANDOFF_THRESHOLD = 0.65;

/** Default maximum result count per search. */
const DEFAULT_MATCH_COUNT = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Request-level context threaded through all search modes.
 * Built by the route and passed unchanged to service functions.
 */
export type SearchContext = {
  /** Anonymous session identifier — client-generated or route-generated UUID. */
  sessionId: string;
  /** Series slug to restrict results to (optional). */
  seriesFilter?: string;
  /** Maximum number of results (default 20, capped at 50 by the route). */
  limit?: number;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function computeConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= HUMAN_HANDOFF_THRESHOLD) return 'medium';
  return 'low';
}

function computeHandoff(results: PosterResult[]): {
  needed: boolean;
  reason: HandoffReason | undefined;
} {
  if (results.length === 0) {
    return { needed: true, reason: 'low_similarity' };
  }
  // The match_posters RPC already filters at HUMAN_HANDOFF_THRESHOLD (0.72),
  // but even results above the similarity threshold may have low overall_confidence
  // when the CLIP embedding is weak (poor image quality, missing metadata).
  if ((results[0]?.overall_confidence ?? 1) < AI_CONFIDENCE_HANDOFF_THRESHOLD) {
    return { needed: true, reason: 'low_confidence' };
  }
  return { needed: false, reason: undefined };
}

function buildSearchResponse(results: PosterResult[], mode: QueryMode): SearchResponse {
  const searchResults: SearchResult[] = results.map((poster) => ({
    poster,
    similarity_score: poster.similarity_score,
    confidence_level: computeConfidenceLevel(poster.similarity_score),
  }));

  const { needed, reason } = computeHandoff(results);

  return {
    results: searchResults,
    query_mode: mode,
    human_handoff_needed: needed,
    ...(reason !== undefined && { handoff_reason: reason }),
  };
}

/**
 * Calls the match_posters RPC and returns typed results with DB latency.
 * All vector math happens in PostgreSQL via pgvector — never in Node.js.
 */
async function runMatchPosters(
  embedding: number[],
  ctx: SearchContext,
): Promise<{ results: PosterResult[]; dbLatencyMs: number }> {
  const dbStart = Date.now();

  const { data, error } = await supabase.rpc('match_posters', {
    query_embedding: embedding,
    match_threshold: HUMAN_HANDOFF_THRESHOLD,
    match_count: ctx.limit ?? DEFAULT_MATCH_COUNT,
    series_filter: ctx.seriesFilter ?? null,
  });

  const dbLatencyMs = Date.now() - dbStart;

  if (error) {
    throw new DatabaseError(`match_posters RPC failed: ${error.message}`);
  }

  return { results: (data ?? []) as PosterResult[], dbLatencyMs };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Text search (Phase 4.2).
 *
 * Flow: analyzeQuery result → generateTextEmbedding → match_posters RPC →
 *       handoff detection → async event log
 */
export async function textSearch(
  analysis: QueryAnalysis,
  ctx: SearchContext,
): Promise<SearchResponse> {
  const totalStart = Date.now();

  const clipStart = Date.now();
  const embedding = await generateTextEmbedding(analysis.processedQuery);
  const clipLatencyMs = Date.now() - clipStart;

  const { results, dbLatencyMs } = await runMatchPosters(embedding, ctx);
  const totalLatencyMs = Date.now() - totalStart;

  const response = buildSearchResponse(results, 'text');

  logSearchEvent({
    session_id: ctx.sessionId,
    query_text: analysis.processedQuery,
    query_mode: 'text',
    result_poster_ids: results.map((r) => r.id),
    top_similarity_score: results[0]?.similarity_score ?? null,
    min_similarity_score: results.at(-1)?.similarity_score ?? null,
    result_count: results.length,
    human_handoff_needed: response.human_handoff_needed,
    handoff_reason: response.handoff_reason ?? null,
    latency_ms: totalLatencyMs,
    clip_latency_ms: clipLatencyMs,
    db_latency_ms: dbLatencyMs,
  });

  return response;
}

/**
 * Image search (Phase 4.3).
 *
 * Accepts a base64 data URI or an HTTPS URL — normalisation to base64 happens
 * inside clipService.generateImageEmbedding.
 */
export async function imageSearch(
  image: string,
  ctx: SearchContext,
): Promise<SearchResponse> {
  const totalStart = Date.now();

  const clipStart = Date.now();
  const embedding = await generateImageEmbedding(image);
  const clipLatencyMs = Date.now() - clipStart;

  const { results, dbLatencyMs } = await runMatchPosters(embedding, ctx);
  const totalLatencyMs = Date.now() - totalStart;

  const response = buildSearchResponse(results, 'image');

  logSearchEvent({
    session_id: ctx.sessionId,
    query_text: null,
    query_mode: 'image',
    result_poster_ids: results.map((r) => r.id),
    top_similarity_score: results[0]?.similarity_score ?? null,
    min_similarity_score: results.at(-1)?.similarity_score ?? null,
    result_count: results.length,
    human_handoff_needed: response.human_handoff_needed,
    handoff_reason: response.handoff_reason ?? null,
    latency_ms: totalLatencyMs,
    clip_latency_ms: clipLatencyMs,
    db_latency_ms: dbLatencyMs,
  });

  return response;
}

/**
 * Hybrid search (Phase 4.4).
 *
 * Runs text and image embeddings in parallel, runs both match_posters queries in
 * parallel, then merges via Reciprocal Rank Fusion (60% visual / 40% text weight).
 */
export async function hybridSearch(
  analysis: QueryAnalysis,
  image: string,
  ctx: SearchContext,
): Promise<SearchResponse> {
  const totalStart = Date.now();

  // Embed both modalities in parallel
  const clipStart = Date.now();
  const [textEmbedding, imageEmbedding] = await Promise.all([
    generateTextEmbedding(analysis.processedQuery),
    generateImageEmbedding(image),
  ]);
  const clipLatencyMs = Date.now() - clipStart;

  // Query DB for both modalities in parallel
  const dbStart = Date.now();
  const [textMatches, imageMatches] = await Promise.all([
    runMatchPosters(textEmbedding, ctx),
    runMatchPosters(imageEmbedding, ctx),
  ]);
  const dbLatencyMs = Date.now() - dbStart;

  // Merge: 60% visual, 40% text (per spec)
  const merged = reciprocalRankFusion([
    { results: imageMatches.results, weight: 0.6 },
    { results: textMatches.results, weight: 0.4 },
  ]);

  const totalLatencyMs = Date.now() - totalStart;
  const response = buildSearchResponse(merged, 'hybrid');

  logSearchEvent({
    session_id: ctx.sessionId,
    query_text: analysis.processedQuery,
    query_mode: 'hybrid',
    result_poster_ids: merged.map((r) => r.id),
    top_similarity_score: merged[0]?.similarity_score ?? null,
    min_similarity_score: merged.at(-1)?.similarity_score ?? null,
    result_count: merged.length,
    human_handoff_needed: response.human_handoff_needed,
    handoff_reason: response.handoff_reason ?? null,
    latency_ms: totalLatencyMs,
    clip_latency_ms: clipLatencyMs,
    db_latency_ms: dbLatencyMs,
  });

  return response;
}

/**
 * Vibe search (Phase 4.4).
 *
 * Expands the aesthetic/mood query to 3–5 concrete descriptions via Claude,
 * embeds each description in parallel, runs match_posters for each, then merges
 * all result sets via Reciprocal Rank Fusion with equal per-expansion weight.
 *
 * This is pure text — no image input. Do not confuse with hybridSearch.
 */
export async function vibeSearch(
  analysis: QueryAnalysis,
  ctx: SearchContext,
): Promise<SearchResponse> {
  const totalStart = Date.now();

  // 1. Expand the vibe query (includes one Anthropic API call)
  const expansions = await expandVibeQuery(analysis.processedQuery);

  // 2. Embed all expansions in parallel
  const clipStart = Date.now();
  const embeddings = await Promise.all(
    expansions.map((phrase) => generateTextEmbedding(phrase)),
  );
  const clipLatencyMs = Date.now() - clipStart;

  // 3. Run match_posters for each embedding in parallel
  const dbStart = Date.now();
  const allMatches = await Promise.all(
    embeddings.map((emb) => runMatchPosters(emb, ctx)),
  );
  const dbLatencyMs = Date.now() - dbStart;

  // 4. Merge all result sets via RRF with equal weight per expansion
  const weight = 1 / expansions.length;
  const merged = reciprocalRankFusion(
    allMatches.map(({ results }) => ({ results, weight })),
  );

  const totalLatencyMs = Date.now() - totalStart;
  const response = buildSearchResponse(merged, 'vibe');

  logSearchEvent({
    session_id: ctx.sessionId,
    query_text: analysis.processedQuery,
    query_mode: 'vibe',
    result_poster_ids: merged.map((r) => r.id),
    top_similarity_score: merged[0]?.similarity_score ?? null,
    min_similarity_score: merged.at(-1)?.similarity_score ?? null,
    result_count: merged.length,
    human_handoff_needed: response.human_handoff_needed,
    handoff_reason: response.handoff_reason ?? null,
    latency_ms: totalLatencyMs,
    clip_latency_ms: clipLatencyMs,
    db_latency_ms: dbLatencyMs,
  });

  return response;
}
