import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IngestPosterData, Poster } from '@poster-pilot/shared';
import { DatabaseError, NotFoundError } from '../../middleware/errorHandler.js';

// ─── Supabase mock ────────────────────────────────────────────────────────────
// We mock the entire supabase module, which also prevents config.ts from running
// (since supabase.ts imports config.ts — and config.ts calls process.exit on
// missing env vars).

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import {
  upsertPoster,
  updateSeriesCentroid,
  getById,
  getBySeriesSlug,
  getVisualSiblings,
} from '../posterService.js';
import type { Series, VisualSibling } from '@poster-pilot/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } };

/**
 * Returns a mock Supabase query builder that supports method chaining.
 * - Terminal methods (.single, .maybeSingle) resolve with `result`.
 * - Direct await (no terminal method) also resolves with `result` via `then`.
 */
function makeChainable<T>(result: MockResult<T>) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // Allows `await supabase.from(...).chain()` without a terminal method
    then: (
      resolve: (value: MockResult<T>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

type PaginatedResult<T> =
  | { data: T[]; count: number; error: null }
  | { data: null; count: null; error: { message: string } };

/**
 * Chainable builder mock for paginated Supabase queries that use
 * .select(cols, { count: 'exact' }).eq().order().range().
 * The builder resolves directly (no .single()/.maybeSingle() terminal).
 */
function makePaginatedChainable<T>(result: PaginatedResult<T>) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: (
      resolve: (value: PaginatedResult<T>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMBEDDING = Array.from({ length: 768 }, () => 0.1);

const INGEST_DATA: IngestPosterData = {
  nara_id: 'nara-001',
  title: 'Buy War Bonds',
  date_created: 'ca. 1942',
  date_normalized: '1942-01-01',
  creator: 'Federal Art Project',
  description: 'A bold graphic image showing an eagle.',
  subject_tags: ['World War II', 'War Bonds'],
  series_title: 'WPA Posters',
  series_id: 'series-uuid',
  physical_description: 'Silkscreen print, 71 x 56 cm',
  reproduction_number: null,
  rights_statement: null,
  image_url: 'https://nara.gov/img/poster-001.jpg',
  thumbnail_url: 'https://nara.gov/img/poster-001-thumb.jpg',
  embedding: EMBEDDING,
  embedding_confidence: 0.91,
  metadata_completeness: 1.0,
  overall_confidence: 0.94,
  ingest_version: 1,
};

const MOCK_POSTER: Poster = {
  id: 'poster-uuid',
  nara_id: INGEST_DATA.nara_id,
  title: INGEST_DATA.title,
  date_created: INGEST_DATA.date_created,
  date_normalized: INGEST_DATA.date_normalized,
  creator: INGEST_DATA.creator,
  description: INGEST_DATA.description,
  subject_tags: INGEST_DATA.subject_tags,
  series_title: INGEST_DATA.series_title,
  series_id: INGEST_DATA.series_id,
  physical_description: INGEST_DATA.physical_description,
  reproduction_number: INGEST_DATA.reproduction_number,
  rights_statement: INGEST_DATA.rights_statement,
  image_url: INGEST_DATA.image_url,
  thumbnail_url: INGEST_DATA.thumbnail_url,
  embedding_confidence: INGEST_DATA.embedding_confidence,
  metadata_completeness: INGEST_DATA.metadata_completeness,
  overall_confidence: INGEST_DATA.overall_confidence,
  ingested_at: '2026-01-01T00:00:00Z',
  last_updated_at: '2026-01-01T00:00:00Z',
  ingest_version: INGEST_DATA.ingest_version,
};

// ─── upsertPoster ─────────────────────────────────────────────────────────────

describe('upsertPoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a new poster (including embedding) when nara_id does not exist', async () => {
    const existenceBuilder = makeChainable({ data: null, error: null });
    const insertBuilder = makeChainable({ data: MOCK_POSTER, error: null });
    mockFrom.mockReturnValueOnce(existenceBuilder).mockReturnValueOnce(insertBuilder);

    const result = await upsertPoster(INGEST_DATA);

    expect(result).toEqual(MOCK_POSTER);
    expect(insertBuilder.insert).toHaveBeenCalledOnce();
    expect(insertBuilder.update).not.toHaveBeenCalled();

    const insertedPayload = insertBuilder.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedPayload).toHaveProperty('embedding');
    expect(insertedPayload).toHaveProperty('nara_id', 'nara-001');
  });

  it('updates metadata only (no embedding) when nara_id exists and image_url is unchanged', async () => {
    const existing = { id: 'poster-uuid', image_url: INGEST_DATA.image_url };
    const existenceBuilder = makeChainable({ data: existing, error: null });
    const updateBuilder = makeChainable({ data: MOCK_POSTER, error: null });
    mockFrom.mockReturnValueOnce(existenceBuilder).mockReturnValueOnce(updateBuilder);

    const result = await upsertPoster(INGEST_DATA);

    expect(result).toEqual(MOCK_POSTER);
    expect(updateBuilder.update).toHaveBeenCalledOnce();
    expect(updateBuilder.insert).not.toHaveBeenCalled();

    const updatePayload = updateBuilder.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload).not.toHaveProperty('embedding');
    expect(updatePayload).not.toHaveProperty('nara_id');
  });

  it('updates including embedding when nara_id exists but image_url has changed', async () => {
    const existing = { id: 'poster-uuid', image_url: 'https://nara.gov/img/old-image.jpg' };
    const existenceBuilder = makeChainable({ data: existing, error: null });
    const updateBuilder = makeChainable({ data: MOCK_POSTER, error: null });
    mockFrom.mockReturnValueOnce(existenceBuilder).mockReturnValueOnce(updateBuilder);

    const result = await upsertPoster(INGEST_DATA);

    expect(result).toEqual(MOCK_POSTER);
    expect(updateBuilder.update).toHaveBeenCalledOnce();

    const updatePayload = updateBuilder.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload).toHaveProperty('embedding');
    expect(updatePayload).toHaveProperty('image_url', INGEST_DATA.image_url);
  });

  it('throws DatabaseError when the existence check query fails', async () => {
    const existenceBuilder = makeChainable({
      data: null,
      error: { message: 'connection refused' },
    });
    mockFrom.mockReturnValueOnce(existenceBuilder);

    await expect(upsertPoster(INGEST_DATA)).rejects.toThrow(DatabaseError);
  });

  it('throws DatabaseError when the insert query fails', async () => {
    const existenceBuilder = makeChainable({ data: null, error: null });
    const insertBuilder = makeChainable({
      data: null,
      error: { message: 'unique constraint violation' },
    });
    mockFrom.mockReturnValueOnce(existenceBuilder).mockReturnValueOnce(insertBuilder);

    await expect(upsertPoster(INGEST_DATA)).rejects.toThrow(DatabaseError);
  });

  it('throws DatabaseError when the update query fails', async () => {
    const existing = { id: 'poster-uuid', image_url: INGEST_DATA.image_url };
    const existenceBuilder = makeChainable({ data: existing, error: null });
    const updateBuilder = makeChainable({
      data: null,
      error: { message: 'write failed' },
    });
    mockFrom.mockReturnValueOnce(existenceBuilder).mockReturnValueOnce(updateBuilder);

    await expect(upsertPoster(INGEST_DATA)).rejects.toThrow(DatabaseError);
  });
});

// ─── updateSeriesCentroid ─────────────────────────────────────────────────────

describe('updateSeriesCentroid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes the correct mean centroid and stores it', async () => {
    // Two 768-dim embeddings: one all-zeros, one all-ones → centroid = all 0.5
    const emb1 = Array.from({ length: 768 }, () => 0);
    const emb2 = Array.from({ length: 768 }, () => 1);
    const fetchBuilder = makeChainable({
      data: [{ embedding: emb1 }, { embedding: emb2 }],
      error: null,
    });
    const updateBuilder = makeChainable({ data: null, error: null });
    mockFrom.mockReturnValueOnce(fetchBuilder).mockReturnValueOnce(updateBuilder);

    await updateSeriesCentroid('series-uuid');

    expect(updateBuilder.update).toHaveBeenCalledOnce();
    const { centroid } = updateBuilder.update.mock.calls[0]?.[0] as { centroid: number[] };
    expect(centroid).toHaveLength(768);
    expect(centroid[0]).toBeCloseTo(0.5);
    expect(centroid[767]).toBeCloseTo(0.5);
  });

  it('logs a warning and does NOT update when the series has no posters', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchBuilder = makeChainable({ data: [], error: null });
    mockFrom.mockReturnValueOnce(fetchBuilder);

    await updateSeriesCentroid('empty-series');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[posterService]'));
    expect(mockFrom).toHaveBeenCalledTimes(1); // only the fetch — no update call
  });

  it('throws DatabaseError when the embedding fetch fails', async () => {
    const fetchBuilder = makeChainable({
      data: null,
      error: { message: 'query timeout' },
    });
    mockFrom.mockReturnValueOnce(fetchBuilder);

    await expect(updateSeriesCentroid('series-uuid')).rejects.toThrow(DatabaseError);
  });

  it('throws DatabaseError when the centroid update fails', async () => {
    const emb = Array.from({ length: 768 }, () => 0.5);
    const fetchBuilder = makeChainable({ data: [{ embedding: emb }], error: null });
    const updateBuilder = makeChainable({
      data: null,
      error: { message: 'disk full' },
    });
    mockFrom.mockReturnValueOnce(fetchBuilder).mockReturnValueOnce(updateBuilder);

    await expect(updateSeriesCentroid('series-uuid')).rejects.toThrow(DatabaseError);
  });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe('getById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the poster when found', async () => {
    const builder = makeChainable({ data: MOCK_POSTER, error: null });
    mockFrom.mockReturnValueOnce(builder);

    const result = await getById('poster-uuid');

    expect(result).toEqual(MOCK_POSTER);
    expect(builder.eq).toHaveBeenCalledWith('id', 'poster-uuid');
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
  });

  it('throws NotFoundError when no row exists', async () => {
    const builder = makeChainable({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await expect(getById('poster-uuid')).rejects.toThrow(NotFoundError);
  });

  it('throws DatabaseError when the query fails', async () => {
    const builder = makeChainable({
      data: null,
      error: { message: 'connection timeout' },
    });
    mockFrom.mockReturnValueOnce(builder);

    await expect(getById('poster-uuid')).rejects.toThrow(DatabaseError);
  });
});

// ─── getBySeriesSlug ──────────────────────────────────────────────────────────

const MOCK_SERIES: Series = {
  id: 'series-uuid',
  slug: 'wpa-posters',
  title: 'WPA Posters',
  description: 'Works Progress Administration posters',
  nara_series_ref: null,
  poster_count: 42,
  created_at: '2026-01-01T00:00:00Z',
};

describe('getBySeriesSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns series metadata and paginated posters', async () => {
    const seriesBuilder = makeChainable({ data: MOCK_SERIES, error: null });
    const posterId = 'poster-uuid';
    const posters = [
      { id: posterId, nara_id: 'nara-001', title: 'T', thumbnail_url: 'u', series_title: 'WPA Posters', overall_confidence: 0.9 },
    ];
    const postersBuilder = makePaginatedChainable({ data: posters, count: 42, error: null });
    mockFrom.mockReturnValueOnce(seriesBuilder).mockReturnValueOnce(postersBuilder);

    const result = await getBySeriesSlug('wpa-posters', 1, 20);

    expect(result.series).toEqual(MOCK_SERIES);
    expect(result.total).toBe(42);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.posters).toHaveLength(1);
    expect(postersBuilder.order).toHaveBeenCalledWith('overall_confidence', { ascending: false });
    expect(postersBuilder.range).toHaveBeenCalledWith(0, 19);
  });

  it('calculates correct range offset for page 2', async () => {
    const seriesBuilder = makeChainable({ data: MOCK_SERIES, error: null });
    const postersBuilder = makePaginatedChainable({ data: [], count: 0, error: null });
    mockFrom.mockReturnValueOnce(seriesBuilder).mockReturnValueOnce(postersBuilder);

    await getBySeriesSlug('wpa-posters', 2, 10);

    // page=2, limit=10 → offset=10, range(10, 19)
    expect(postersBuilder.range).toHaveBeenCalledWith(10, 19);
  });

  it('throws NotFoundError when the series slug does not exist', async () => {
    const seriesBuilder = makeChainable({ data: null, error: null });
    mockFrom.mockReturnValueOnce(seriesBuilder);

    await expect(getBySeriesSlug('nonexistent', 1, 20)).rejects.toThrow(NotFoundError);
  });

  it('throws DatabaseError when the series query fails', async () => {
    const seriesBuilder = makeChainable({
      data: null,
      error: { message: 'DB down' },
    });
    mockFrom.mockReturnValueOnce(seriesBuilder);

    await expect(getBySeriesSlug('wpa-posters', 1, 20)).rejects.toThrow(DatabaseError);
  });

  it('throws DatabaseError when the posters query fails', async () => {
    const seriesBuilder = makeChainable({ data: MOCK_SERIES, error: null });
    const postersBuilder = makePaginatedChainable({
      data: null,
      count: null,
      error: { message: 'query timeout' },
    });
    mockFrom.mockReturnValueOnce(seriesBuilder).mockReturnValueOnce(postersBuilder);

    await expect(getBySeriesSlug('wpa-posters', 1, 20)).rejects.toThrow(DatabaseError);
  });
});

// ─── getVisualSiblings ────────────────────────────────────────────────────────

describe('getVisualSiblings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns siblings from the RPC', async () => {
    const siblings: VisualSibling[] = [
      { id: 's1', nara_id: 'nara-s1', title: 'Sibling 1', thumbnail_url: 'u1', similarity_score: 0.95 },
      { id: 's2', nara_id: 'nara-s2', title: 'Sibling 2', thumbnail_url: 'u2', similarity_score: 0.88 },
    ];
    mockRpc.mockResolvedValueOnce({ data: siblings, error: null });

    const result = await getVisualSiblings('poster-uuid');

    expect(result).toEqual(siblings);
    expect(mockRpc).toHaveBeenCalledWith('get_visual_siblings', {
      source_poster_id: 'poster-uuid',
      sibling_count: 5,
    });
  });

  it('returns an empty array when the RPC returns null data', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getVisualSiblings('poster-uuid');

    expect(result).toEqual([]);
  });

  it('throws DatabaseError when the RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC error' } });

    await expect(getVisualSiblings('poster-uuid')).rejects.toThrow(DatabaseError);
  });
});
