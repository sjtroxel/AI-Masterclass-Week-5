/**
 * Computes cosine similarity between two numeric vectors.
 *
 * Returns a value in [-1, 1] where:
 *   1.0  = identical direction (high semantic similarity for CLIP embeddings)
 *   0.0  = orthogonal (no relationship)
 *  -1.0  = opposite direction
 *
 * Returns 0 safely when either vector is all zeros to avoid division by zero.
 *
 * Used in:
 *  - ingestWorker: computing embedding_confidence (poster vs. series centroid)
 *  - searchService (Phase 4): manual similarity scoring where needed outside pgvector
 *
 * `?? 0` guards satisfy noUncheckedIndexedAccess in tsconfig.base.json.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
