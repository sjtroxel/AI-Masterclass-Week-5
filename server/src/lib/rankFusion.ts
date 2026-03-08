import type { PosterResult } from '@poster-pilot/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Smoothing constant from the original RRF paper (Cormack, Clarke & Buettcher, 2009).
 * k=60 prevents high-ranked documents in a single list from dominating the merged score.
 */
const DEFAULT_RRF_K = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

export type RRFInput = {
  /** Ranked list of results for this modality/expansion. */
  results: PosterResult[];
  /** Fractional weight for this result set (all weights should sum to 1). */
  weight: number;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Merges multiple ranked result sets using weighted Reciprocal Rank Fusion.
 *
 * Formula for each document d:
 *   score(d) = Σ_i  weight_i / (k + rank_i(d))
 * where rank_i is 1-indexed; documents absent from set i contribute nothing.
 *
 * The returned list is sorted by combined RRF score descending.
 * Each result's `similarity_score` is set to the BEST original cosine similarity
 * that poster achieved across all input sets — more semantically meaningful than
 * the rank-derived score.
 *
 * @param inputs  Array of { results, weight } — weights need not sum to exactly 1,
 *                but the caller should ensure they sum to 1 for sensible ordering.
 * @param k       RRF smoothing constant (default 60).
 */
export function reciprocalRankFusion(inputs: RRFInput[], k: number = DEFAULT_RRF_K): PosterResult[] {
  const rrfScores = new Map<string, number>();       // poster id → combined RRF score
  const bestSimilarity = new Map<string, number>();  // poster id → best similarity_score
  const posterMap = new Map<string, PosterResult>(); // poster id → canonical result object

  for (const { results, weight } of inputs) {
    for (let i = 0; i < results.length; i++) {
      const poster = results[i];
      if (!poster) continue;

      const rank = i + 1; // 1-indexed
      const contribution = weight / (k + rank);

      rrfScores.set(poster.id, (rrfScores.get(poster.id) ?? 0) + contribution);

      const currentBest = bestSimilarity.get(poster.id) ?? -Infinity;
      if (poster.similarity_score > currentBest) {
        bestSimilarity.set(poster.id, poster.similarity_score);
        posterMap.set(poster.id, poster);
      } else if (!posterMap.has(poster.id)) {
        posterMap.set(poster.id, poster);
      }
    }
  }

  // Sort by combined RRF score descending; attach the best cosine similarity for display.
  return [...rrfScores.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => {
      const poster = posterMap.get(id)!;
      return { ...poster, similarity_score: bestSimilarity.get(id) ?? poster.similarity_score };
    });
}
