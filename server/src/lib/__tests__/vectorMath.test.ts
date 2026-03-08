import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../vectorMath.js';

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1.0 for two identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for two orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns -1.0 for two perfectly opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('returns a value between -1 and 1 for arbitrary vectors', () => {
    const a = [0.1, 0.5, -0.3, 0.8];
    const b = [0.4, -0.2, 0.9, 0.1];
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns 0.0 when either vector is all zeros (avoids division by zero)', () => {
    const zeros = [0, 0, 0];
    const nonZero = [1, 2, 3];
    expect(cosineSimilarity(zeros, nonZero)).toBe(0);
    expect(cosineSimilarity(nonZero, zeros)).toBe(0);
  });

  it('handles 768-dimension vectors without precision issues', () => {
    const a = Array.from({ length: 768 }, () => 0.1);
    const b = Array.from({ length: 768 }, () => 0.1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});
