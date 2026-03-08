import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../rankFusion.js';
import type { PosterResult } from '@poster-pilot/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePoster(id: string, similarityScore: number): PosterResult {
  return {
    id,
    nara_id: `nara-${id}`,
    title: `Poster ${id}`,
    date_created: null,
    creator: null,
    thumbnail_url: `https://example.com/${id}.jpg`,
    series_title: null,
    overall_confidence: 0.9,
    similarity_score: similarityScore,
  };
}

const P1 = makePoster('p1', 0.95);
const P2 = makePoster('p2', 0.88);
const P3 = makePoster('p3', 0.82);
const P4 = makePoster('p4', 0.76);
const P5 = makePoster('p5', 0.73);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reciprocalRankFusion', () => {
  it('returns an empty array when all input sets are empty', () => {
    const result = reciprocalRankFusion([
      { results: [], weight: 0.6 },
      { results: [], weight: 0.4 },
    ]);
    expect(result).toHaveLength(0);
  });

  it('returns the single set unchanged when only one input is provided', () => {
    const result = reciprocalRankFusion([{ results: [P1, P2, P3], weight: 1 }]);
    expect(result.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('deduplicates posters that appear in multiple result sets', () => {
    // P1, P2 appear in both; P3 only in visual; P4 only in text
    const visual = [P1, P2, P3];
    const text = [P1, P2, P4];

    const result = reciprocalRankFusion([
      { results: visual, weight: 0.6 },
      { results: text, weight: 0.4 },
    ]);

    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toHaveLength(4); // p1, p2, p3, p4
  });

  it('ranks a poster appearing in both sets higher than one appearing in only one', () => {
    // P1 appears in both result sets → should rank above P3 (visual only) and P4 (text only)
    const visual = [P1, P3];
    const text = [P1, P4];

    const result = reciprocalRankFusion([
      { results: visual, weight: 0.6 },
      { results: text, weight: 0.4 },
    ]);

    expect(result[0]?.id).toBe('p1');
  });

  it('gives higher weight modality precedence when rank is equal', () => {
    // P1 is rank-1 in the 60% set; P2 is rank-1 in the 40% set.
    // P1 should come first due to higher weight: 0.6/61 > 0.4/61.
    // Note: P3 (rank-2 in 60% set) scores 0.6/62 = 0.00968 which beats
    // P2 (rank-1 in 40% set) at 0.4/61 = 0.00656 — so order is P1, P3, P2, P4.
    const visual = [P1, P3];
    const text = [P2, P4];

    const result = reciprocalRankFusion([
      { results: visual, weight: 0.6 },
      { results: text, weight: 0.4 },
    ]);

    expect(result[0]?.id).toBe('p1');
    // P3 (visual rank-2, 60%): 0.6/62 = 0.00968 > P2 (text rank-1, 40%): 0.4/61 = 0.00656
    expect(result[1]?.id).toBe('p3');
    expect(result[2]?.id).toBe('p2');
  });

  it('assigns the best similarity_score across all sets to each merged result', () => {
    // P1 with score 0.95 in visual; P1 with score 0.80 in text → expect 0.95
    const p1Visual = { ...P1, similarity_score: 0.95 };
    const p1Text = { ...P1, similarity_score: 0.80 };

    const result = reciprocalRankFusion([
      { results: [p1Visual], weight: 0.6 },
      { results: [p1Text], weight: 0.4 },
    ]);

    const merged = result.find((r) => r.id === 'p1');
    expect(merged?.similarity_score).toBeCloseTo(0.95);
  });

  it('handles a single result set with one poster', () => {
    const result = reciprocalRankFusion([{ results: [P1], weight: 1 }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('p1');
  });

  it('handles equal weights correctly (vibe search pattern)', () => {
    // Three equally-weighted expansions — P1 appears in all three → ranks first
    const expansion1 = [P1, P2];
    const expansion2 = [P1, P3];
    const expansion3 = [P1, P4];
    const weight = 1 / 3;

    const result = reciprocalRankFusion([
      { results: expansion1, weight },
      { results: expansion2, weight },
      { results: expansion3, weight },
    ]);

    expect(result[0]?.id).toBe('p1');
  });

  it('produces deterministic output for the same input', () => {
    const inputs = [
      { results: [P1, P2, P3], weight: 0.6 },
      { results: [P2, P4, P5], weight: 0.4 },
    ];

    const run1 = reciprocalRankFusion(inputs).map((r) => r.id);
    const run2 = reciprocalRankFusion(inputs).map((r) => r.id);
    expect(run1).toEqual(run2);
  });

  it('correctly combines 60/40 weights for hybrid search pattern', () => {
    // Visual (60%): [P1, P3]; Text (40%): [P2, P3]
    // P3 appears in both sets; P1 has higher weight advantage
    const visual = [P1, P3];
    const text = [P2, P3];

    const result = reciprocalRankFusion([
      { results: visual, weight: 0.6 },
      { results: text, weight: 0.4 },
    ]);

    // P3 is in both sets; P1 is rank-1 in 60% set. P3 should beat P2 (40% rank-1).
    const ids = result.map((r) => r.id);
    // P1: 0.6/(60+1) = 0.00984
    // P3: 0.6/(60+2) + 0.4/(60+2) = 1/62 ≈ 0.01613
    // P2: 0.4/(60+1) = 0.00656
    expect(ids.indexOf('p3')).toBeLessThan(ids.indexOf('p2'));
  });
});
