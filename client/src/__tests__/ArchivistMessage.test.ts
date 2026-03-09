import { describe, it, expect } from 'vitest';
import { buildCitationHref } from '../components/ArchivistMessage.js';

describe('buildCitationHref', () => {
  it('returns a /poster/:uuid route when the nara_id is in the map', () => {
    const idMap = { 'NAID-100': 'uuid-abc-123' };
    expect(buildCitationHref('NAID-100', idMap)).toBe('/poster/uuid-abc-123');
  });

  it('returns a /poster/:uuid route for DPLA-format IDs when mapped', () => {
    const idMap = { 'dpla-e7f8a9': 'uuid-def-456' };
    expect(buildCitationHref('dpla-e7f8a9', idMap)).toBe('/poster/uuid-def-456');
  });

  it('falls back to a text search when the nara_id is not in the map', () => {
    expect(buildCitationHref('NAID-999', {})).toBe('/search?q=NAID-999&mode=text');
  });

  it('URL-encodes spaces in the fallback search query', () => {
    const result = buildCitationHref('dpla-hello world', {});
    expect(result).toBe('/search?q=dpla-hello%20world&mode=text');
  });

  it('URL-encodes special characters in the fallback search query', () => {
    const result = buildCitationHref('nara/record?id=1', {});
    expect(result).toContain('/search?q=');
    expect(result).not.toContain(' ');
  });

  it('prefers the UUID route over the fallback when the nara_id is present', () => {
    const idMap = { 'NAID-100': 'correct-uuid', 'NAID-200': 'other-uuid' };
    expect(buildCitationHref('NAID-100', idMap)).not.toContain('/search');
    expect(buildCitationHref('NAID-100', idMap)).toBe('/poster/correct-uuid');
  });
});
