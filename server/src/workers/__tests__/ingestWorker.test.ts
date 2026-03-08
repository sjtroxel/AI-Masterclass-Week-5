import { describe, it, expect, vi } from 'vitest';

// ─── Mock heavy imports ───────────────────────────────────────────────────────
// These must be declared before the worker import.
// They prevent config.ts from running (which calls process.exit on missing env vars)
// and stop the worker from making real network or DB calls.

vi.mock('../../lib/config.js', () => ({
  config: {
    naraApiKey: 'test-nara-key',
    replicateApiKey: 'test-replicate-key',
    clipModelVersion: 'test-version',
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon',
    supabaseServiceRoleKey: 'test-service-role',
    anthropicApiKey: 'test-anthropic',
    port: 3001,
    clientOrigin: 'http://localhost:5173',
  },
}));

vi.mock('../../lib/supabase.js', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../../services/clipService.js', () => ({ generateImageEmbedding: vi.fn() }));
vi.mock('../../services/posterService.js', () => ({
  upsertPoster: vi.fn(),
  updateSeriesCentroid: vi.fn(),
}));

// Import pure helpers AFTER mocks are in place
import {
  computeMetadataCompleteness,
  parseDateNormalized,
  mapNaraRecord,
  type NaraRawRecord,
} from '../ingestWorker.js';

// ─── computeMetadataCompleteness ──────────────────────────────────────────────

describe('computeMetadataCompleteness', () => {
  it('returns 1.0 when all 6 required fields are present', () => {
    const score = computeMetadataCompleteness({
      title: 'Buy War Bonds',
      date_created: 'ca. 1942',
      creator: 'Federal Art Project',
      description: 'A bold graphic image.',
      nara_id: 'nara-001',
      series_title: 'WPA Posters',
    });
    expect(score).toBe(1.0);
  });

  it('returns 0.5 when 3 of 6 required fields are present', () => {
    const score = computeMetadataCompleteness({
      title: 'Untitled',
      date_created: null,
      creator: null,
      description: 'Some description.',
      nara_id: 'nara-002',
      series_title: null,
    });
    expect(score).toBeCloseTo(3 / 6);
  });

  it('returns 0.0 when all required fields are null', () => {
    const score = computeMetadataCompleteness({
      title: 'Untitled', // title is always set to 'Untitled' by mapper; test the edge case
      date_created: null,
      creator: null,
      description: null,
      nara_id: 'nara-003',
      series_title: null,
    });
    // title and nara_id are present → 2/6
    expect(score).toBeCloseTo(2 / 6);
  });

  it('treats empty strings as missing', () => {
    const score = computeMetadataCompleteness({
      title: '',
      date_created: '',
      creator: '',
      description: '',
      nara_id: '',
      series_title: '',
    });
    expect(score).toBe(0.0);
  });
});

// ─── parseDateNormalized ──────────────────────────────────────────────────────

describe('parseDateNormalized', () => {
  it('extracts the first 4-digit year as YYYY-01-01', () => {
    expect(parseDateNormalized('ca. 1942')).toBe('1942-01-01');
  });

  it('handles range dates by taking the start year', () => {
    expect(parseDateNormalized('1941-1945')).toBe('1941-01-01');
  });

  it('handles slash-separated ranges', () => {
    expect(parseDateNormalized('1936/1943')).toBe('1936-01-01');
  });

  it('returns null for null input', () => {
    expect(parseDateNormalized(null)).toBeNull();
  });

  it('returns null when no year is found', () => {
    expect(parseDateNormalized('undated')).toBeNull();
  });
});

// ─── mapNaraRecord ────────────────────────────────────────────────────────────

describe('mapNaraRecord', () => {
  const SERIES_ID = 'series-uuid';
  const SERIES_TITLE = 'WPA Posters';

  const FULL_RECORD: NaraRawRecord = {
    naId: 2696447,
    title: 'America\'s Answer! Production',
    scopeAndContentNote: 'Color lithograph poster encouraging production.',
    coverageDate: { logicalDate: '1942' },
    creators: [{ displayName: 'Federal Art Project' }],
    objects: [
      {
        file: { url: 'https://nara.gov/img/poster.jpg' },
        thumbnail: { url: 'https://nara.gov/img/poster-thumb.jpg' },
      },
    ],
    subjectHeadings: [{ termName: 'World War II' }, { termName: 'Production' }],
    physicalDescription: 'Silkscreen print, 71 x 56 cm',
    reproductionNumber: 'LC-USZC4-1234',
  };

  it('maps all fields correctly from a full NARA record', () => {
    const result = mapNaraRecord(FULL_RECORD, SERIES_ID, SERIES_TITLE);

    expect(result).not.toBeNull();
    expect(result?.nara_id).toBe('2696447');
    expect(result?.title).toBe("America's Answer! Production");
    expect(result?.description).toBe('Color lithograph poster encouraging production.');
    expect(result?.date_created).toBe('1942');
    expect(result?.creator).toBe('Federal Art Project');
    expect(result?.image_url).toBe('https://nara.gov/img/poster.jpg');
    expect(result?.thumbnail_url).toBe('https://nara.gov/img/poster-thumb.jpg');
    expect(result?.subject_tags).toEqual(['World War II', 'Production']);
    expect(result?.physical_description).toBe('Silkscreen print, 71 x 56 cm');
    expect(result?.series_id).toBe(SERIES_ID);
    expect(result?.series_title).toBe(SERIES_TITLE);
  });

  it('falls back to the image_url as thumbnail when no thumbnail object is present', () => {
    const record: NaraRawRecord = {
      ...FULL_RECORD,
      objects: [{ file: { url: 'https://nara.gov/img/poster.jpg' } }],
    };
    const result = mapNaraRecord(record, SERIES_ID, SERIES_TITLE);
    expect(result?.thumbnail_url).toBe('https://nara.gov/img/poster.jpg');
  });

  it('normalizes the date to YYYY-01-01 format', () => {
    const result = mapNaraRecord(FULL_RECORD, SERIES_ID, SERIES_TITLE);
    expect(result?.date_normalized).toBe('1942-01-01');
  });

  it('handles a string coverageDate', () => {
    const record: NaraRawRecord = { ...FULL_RECORD, coverageDate: 'ca. 1941-1943' };
    const result = mapNaraRecord(record, SERIES_ID, SERIES_TITLE);
    expect(result?.date_created).toBe('ca. 1941-1943');
    expect(result?.date_normalized).toBe('1941-01-01');
  });

  it('handles a string creator (not an object)', () => {
    const record: NaraRawRecord = { ...FULL_RECORD, creators: ['Works Progress Administration'] };
    const result = mapNaraRecord(record, SERIES_ID, SERIES_TITLE);
    expect(result?.creator).toBe('Works Progress Administration');
  });

  it('returns null when naId is missing', () => {
    const { naId: _, ...withoutId } = FULL_RECORD;
    expect(mapNaraRecord(withoutId, SERIES_ID, SERIES_TITLE)).toBeNull();
  });

  it('returns null when no image URL is present', () => {
    const record: NaraRawRecord = { ...FULL_RECORD, objects: [] };
    expect(mapNaraRecord(record, SERIES_ID, SERIES_TITLE)).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: NaraRawRecord = {
      naId: 999,
      objects: [{ file: { url: 'https://nara.gov/img/x.jpg' } }],
    };
    const result = mapNaraRecord(minimal, SERIES_ID, SERIES_TITLE);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Untitled');
    expect(result?.creator).toBeNull();
    expect(result?.description).toBeNull();
    expect(result?.subject_tags).toEqual([]);
  });
});
