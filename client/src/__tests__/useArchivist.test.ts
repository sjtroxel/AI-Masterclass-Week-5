import { describe, it, expect } from 'vitest';
import { SESSION_KEY, buildPosterIdMap } from '../hooks/useArchivist.js';

describe('SESSION_KEY', () => {
  it('matches the expected sessionStorage key', () => {
    expect(SESSION_KEY).toBe('archivist-session-id');
  });
});

describe('buildPosterIdMap', () => {
  it('builds a nara_id → UUID map from poster objects', () => {
    const posters = [
      { id: 'uuid-001', nara_id: 'NAID-100' },
      { id: 'uuid-002', nara_id: 'NAID-200' },
      { id: 'uuid-003', nara_id: 'dpla-abc' },
    ];
    expect(buildPosterIdMap(posters)).toEqual({
      'NAID-100': 'uuid-001',
      'NAID-200': 'uuid-002',
      'dpla-abc': 'uuid-003',
    });
  });

  it('returns an empty object for an empty array', () => {
    expect(buildPosterIdMap([])).toEqual({});
  });

  it('last entry wins when two posters share the same nara_id', () => {
    const posters = [
      { id: 'uuid-001', nara_id: 'NAID-100' },
      { id: 'uuid-002', nara_id: 'NAID-100' },
    ];
    expect(buildPosterIdMap(posters)).toEqual({ 'NAID-100': 'uuid-002' });
  });

  it('handles DPLA-format IDs alongside NAID-format IDs', () => {
    const posters = [
      { id: 'uuid-001', nara_id: 'NAID-12345678' },
      { id: 'uuid-002', nara_id: 'dpla-e7f8a9b0c1d2' },
    ];
    const result = buildPosterIdMap(posters);
    expect(result['NAID-12345678']).toBe('uuid-001');
    expect(result['dpla-e7f8a9b0c1d2']).toBe('uuid-002');
  });

  it('produces a map with the same entry count as unique nara_ids', () => {
    const posters = [
      { id: 'uuid-001', nara_id: 'NAID-001' },
      { id: 'uuid-002', nara_id: 'NAID-002' },
      { id: 'uuid-003', nara_id: 'NAID-003' },
    ];
    expect(Object.keys(buildPosterIdMap(posters))).toHaveLength(3);
  });
});
