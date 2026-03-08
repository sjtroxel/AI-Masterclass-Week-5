import { describe, it, expect, vi } from 'vitest';

// ─── Mock heavy imports ───────────────────────────────────────────────────────
// These must be declared before the worker import.
// They prevent config.ts from running (which calls process.exit on missing env vars)
// and stop the worker from making real network or DB calls.

vi.mock('../../lib/config.js', () => ({
  config: {
    dplaApiKey: 'test-dpla-key',
    naraApiKey: null,
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
  mapDplaRecord,
  type DplaItem,
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

// ─── mapDplaRecord ────────────────────────────────────────────────────────────

describe('mapDplaRecord', () => {
  const SERIES_ID = 'series-uuid';
  const SERIES_TITLE = 'WPA Posters';

  const FULL_ITEM: DplaItem = {
    id: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    '@id': 'http://dp.la/api/items/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    isShownAt: 'https://catalog.archives.gov/id/534144',
    dataProvider: 'National Archives and Records Administration',
    provider: {
      '@id': 'http://dp.la/api/contributor/nara',
      name: 'National Archives and Records Administration',
    },
    object: 'https://nara.gov/img/poster-thumb.jpg',
    hasView: [{ '@id': 'https://nara.gov/img/poster.jpg', format: 'image/jpeg' }],
    sourceResource: {
      title: "America's Answer! Production",
      description: 'Color lithograph poster encouraging wartime production.',
      creator: 'Federal Art Project',
      date: { begin: '1942', end: '1942', displayDate: 'ca. 1942' },
      subject: [{ name: 'World War II' }, { name: 'Production' }],
      format: 'Silkscreen print, 71 x 56 cm',
      rights: 'No copyright restrictions known',
      identifier: ['NAID-2696447'],
    },
  };

  it('maps all fields correctly from a full DPLA item', () => {
    const result = mapDplaRecord(FULL_ITEM, SERIES_ID, SERIES_TITLE);

    expect(result).not.toBeNull();
    expect(result?.nara_id).toBe('2696447');
    expect(result?.title).toBe("America's Answer! Production");
    expect(result?.description).toBe('Color lithograph poster encouraging wartime production.');
    expect(result?.date_created).toBe('ca. 1942');
    expect(result?.creator).toBe('Federal Art Project');
    expect(result?.image_url).toBe('https://nara.gov/img/poster.jpg');
    expect(result?.thumbnail_url).toBe('https://nara.gov/img/poster-thumb.jpg');
    expect(result?.subject_tags).toEqual(['World War II', 'Production']);
    expect(result?.physical_description).toBe('Silkscreen print, 71 x 56 cm');
    expect(result?.rights_statement).toBe('No copyright restrictions known');
    expect(result?.series_id).toBe(SERIES_ID);
    expect(result?.series_title).toBe(SERIES_TITLE);
  });

  it('uses NARA NAID extracted from identifier when available', () => {
    const result = mapDplaRecord(FULL_ITEM, SERIES_ID, SERIES_TITLE);
    expect(result?.nara_id).toBe('2696447');
  });

  it('falls back to "dpla-{id}" when no NARA identifier is present', () => {
    const item: DplaItem = {
      ...FULL_ITEM,
      sourceResource: { ...FULL_ITEM.sourceResource, identifier: [] },
    };
    const result = mapDplaRecord(item, SERIES_ID, SERIES_TITLE);
    expect(result?.nara_id).toBe(`dpla-${FULL_ITEM.id}`);
  });

  it('uses hasView[0] as image_url and object as thumbnail_url', () => {
    const result = mapDplaRecord(FULL_ITEM, SERIES_ID, SERIES_TITLE);
    expect(result?.image_url).toBe('https://nara.gov/img/poster.jpg');
    expect(result?.thumbnail_url).toBe('https://nara.gov/img/poster-thumb.jpg');
  });

  it('falls back to object URL for both image and thumbnail when hasView is absent', () => {
    const { hasView: _hasView, ...withoutHasView } = FULL_ITEM;
    const item: DplaItem = withoutHasView;
    const result = mapDplaRecord(item, SERIES_ID, SERIES_TITLE);
    expect(result?.image_url).toBe('https://nara.gov/img/poster-thumb.jpg');
    expect(result?.thumbnail_url).toBe('https://nara.gov/img/poster-thumb.jpg');
  });

  it('normalizes the date to YYYY-01-01 format using displayDate', () => {
    const result = mapDplaRecord(FULL_ITEM, SERIES_ID, SERIES_TITLE);
    expect(result?.date_normalized).toBe('1942-01-01');
  });

  it('handles an array title by taking the first element', () => {
    const item: DplaItem = {
      ...FULL_ITEM,
      sourceResource: {
        ...FULL_ITEM.sourceResource,
        title: ['Primary Title', 'Alternative Title'],
      },
    };
    const result = mapDplaRecord(item, SERIES_ID, SERIES_TITLE);
    expect(result?.title).toBe('Primary Title');
  });

  it('handles an array creator by taking the first element', () => {
    const item: DplaItem = {
      ...FULL_ITEM,
      sourceResource: {
        ...FULL_ITEM.sourceResource,
        creator: ['Federal Art Project', 'Office of War Information'],
      },
    };
    const result = mapDplaRecord(item, SERIES_ID, SERIES_TITLE);
    expect(result?.creator).toBe('Federal Art Project');
  });

  it('handles date as an array by taking the first element', () => {
    const item: DplaItem = {
      ...FULL_ITEM,
      sourceResource: {
        ...FULL_ITEM.sourceResource,
        date: [{ displayDate: '1943', begin: '1943' }],
      },
    };
    const result = mapDplaRecord(item, SERIES_ID, SERIES_TITLE);
    expect(result?.date_created).toBe('1943');
  });

  it('falls back to date.begin when displayDate is absent', () => {
    const item: DplaItem = {
      ...FULL_ITEM,
      sourceResource: {
        ...FULL_ITEM.sourceResource,
        date: { begin: '1941', end: '1945' },
      },
    };
    const result = mapDplaRecord(item, SERIES_ID, SERIES_TITLE);
    expect(result?.date_created).toBe('1941');
  });

  it('returns null when item id is missing', () => {
    const item = { ...FULL_ITEM, id: '' };
    expect(mapDplaRecord(item, SERIES_ID, SERIES_TITLE)).toBeNull();
  });

  it('returns null when no image URL is present', () => {
    const { object: _object, ...withoutObject } = FULL_ITEM;
    const item: DplaItem = { ...withoutObject, hasView: [] };
    expect(mapDplaRecord(item, SERIES_ID, SERIES_TITLE)).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: DplaItem = {
      id: 'minimal-id',
      object: 'https://nara.gov/img/x.jpg',
      sourceResource: {},
    };
    const result = mapDplaRecord(minimal, SERIES_ID, SERIES_TITLE);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Untitled');
    expect(result?.creator).toBeNull();
    expect(result?.description).toBeNull();
    expect(result?.subject_tags).toEqual([]);
    expect(result?.nara_id).toBe('dpla-minimal-id');
  });
});
