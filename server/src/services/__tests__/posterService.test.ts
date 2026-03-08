import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IngestPosterData, Poster } from '@poster-pilot/shared';
import { DatabaseError } from '../../middleware/errorHandler.js';

// ─── Supabase mock ────────────────────────────────────────────────────────────
// We mock the entire supabase module, which also prevents config.ts from running
// (since supabase.ts imports config.ts — and config.ts calls process.exit on
// missing env vars).

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

import { upsertPoster, updateSeriesCentroid } from '../posterService.js';

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
