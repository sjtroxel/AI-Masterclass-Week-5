import { describe, it, expect } from 'vitest';
import { formatSimilarityPct } from '../components/VisualSiblings.js';

describe('formatSimilarityPct', () => {
  it('formats a high similarity score correctly', () => {
    expect(formatSimilarityPct(0.94)).toBe('94% similar');
  });

  it('formats the handoff threshold exactly', () => {
    expect(formatSimilarityPct(0.72)).toBe('72% similar');
  });

  it('rounds to the nearest whole percent (rounds up)', () => {
    expect(formatSimilarityPct(0.855)).toBe('86% similar');
  });

  it('rounds to the nearest whole percent (rounds down)', () => {
    expect(formatSimilarityPct(0.854)).toBe('85% similar');
  });

  it('handles perfect similarity', () => {
    expect(formatSimilarityPct(1.0)).toBe('100% similar');
  });

  it('handles zero similarity', () => {
    expect(formatSimilarityPct(0.0)).toBe('0% similar');
  });
});
