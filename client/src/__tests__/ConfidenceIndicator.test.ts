import { describe, it, expect } from 'vitest';
import { getConfidenceColor } from '../components/ConfidenceIndicator.js';

describe('getConfidenceColor', () => {
  it('returns "success" for score >= 0.85', () => {
    expect(getConfidenceColor(0.90)).toBe('success');
    expect(getConfidenceColor(0.85)).toBe('success');
    expect(getConfidenceColor(1.0)).toBe('success');
  });

  it('returns "warning" for score in the 0.72–0.84 range', () => {
    expect(getConfidenceColor(0.78)).toBe('warning');
    expect(getConfidenceColor(0.72)).toBe('warning');
    expect(getConfidenceColor(0.84)).toBe('warning');
  });

  it('returns "danger" for score < 0.72', () => {
    expect(getConfidenceColor(0.65)).toBe('danger');
    expect(getConfidenceColor(0.0)).toBe('danger');
    expect(getConfidenceColor(0.71)).toBe('danger');
  });
});
