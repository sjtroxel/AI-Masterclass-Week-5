import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { Poster, VisualSibling } from '@poster-pilot/shared';
import { NotFoundError, DatabaseError } from '../../middleware/errorHandler.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Must be declared before module imports that pull in posterService transitively.

vi.mock('../../services/posterService.js', () => ({
  getById: vi.fn(),
  getVisualSiblings: vi.fn(),
  getBySeriesSlug: vi.fn(),
}));

// Import after mocks are registered
import postersRouter from '../posters.js';
import seriesRouter from '../series.js';
import * as posterService from '../../services/posterService.js';
import { errorHandler } from '../../middleware/errorHandler.js';

// ─── Test app factory ─────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/posters', postersRouter);
  app.use('/api/series', seriesRouter);
  // Global error handler must come last
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) =>
    errorHandler(err, req, res, next),
  );
  return app;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const INVALID_UUID = 'not-a-uuid';

const MOCK_POSTER: Poster = {
  id: VALID_UUID,
  nara_id: 'nara-001',
  title: 'Buy War Bonds',
  date_created: 'ca. 1942',
  date_normalized: '1942-01-01',
  creator: 'Federal Art Project',
  description: 'A bold graphic image.',
  subject_tags: ['WWII', 'War Bonds'],
  series_title: 'WPA Posters',
  series_id: 'series-uuid',
  physical_description: 'Silkscreen, 71x56cm',
  reproduction_number: null,
  rights_statement: null,
  image_url: 'https://example.com/poster.jpg',
  thumbnail_url: 'https://example.com/poster-thumb.jpg',
  embedding_confidence: 0.91,
  metadata_completeness: 1.0,
  overall_confidence: 0.94,
  ingested_at: '2026-01-01T00:00:00Z',
  last_updated_at: '2026-01-01T00:00:00Z',
  ingest_version: 1,
};

const MOCK_SIBLINGS: VisualSibling[] = [
  { id: 'sib-1', nara_id: 'nara-sib-1', title: 'Sibling A', thumbnail_url: 'https://example.com/s1.jpg', similarity_score: 0.95 },
  { id: 'sib-2', nara_id: 'nara-sib-2', title: 'Sibling B', thumbnail_url: 'https://example.com/s2.jpg', similarity_score: 0.88 },
];

// ─── GET /api/posters/:id ─────────────────────────────────────────────────────

describe('GET /api/posters/:id', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with poster data when the poster exists', async () => {
    vi.mocked(posterService.getById).mockResolvedValueOnce(MOCK_POSTER);

    const res = await request(app).get(`/api/posters/${VALID_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: MOCK_POSTER });
    expect(posterService.getById).toHaveBeenCalledWith(VALID_UUID);
  });

  it('returns 404 when the poster does not exist', async () => {
    vi.mocked(posterService.getById).mockRejectedValueOnce(
      new NotFoundError(`Poster not found: ${VALID_UUID}`),
    );

    const res = await request(app).get(`/api/posters/${VALID_UUID}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when the id is not a valid UUID', async () => {
    const res = await request(app).get(`/api/posters/${INVALID_UUID}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    // Service should never be called for invalid input
    expect(posterService.getById).not.toHaveBeenCalled();
  });

  it('returns 500 when the service throws a DatabaseError', async () => {
    vi.mocked(posterService.getById).mockRejectedValueOnce(
      new DatabaseError('DB connection failed'),
    );

    const res = await request(app).get(`/api/posters/${VALID_UUID}`);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── GET /api/posters/:id/siblings ───────────────────────────────────────────

describe('GET /api/posters/:id/siblings', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with siblings when poster exists', async () => {
    vi.mocked(posterService.getById).mockResolvedValueOnce(MOCK_POSTER);
    vi.mocked(posterService.getVisualSiblings).mockResolvedValueOnce(MOCK_SIBLINGS);

    const res = await request(app).get(`/api/posters/${VALID_UUID}/siblings`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: MOCK_SIBLINGS });
    expect(posterService.getById).toHaveBeenCalledWith(VALID_UUID);
    expect(posterService.getVisualSiblings).toHaveBeenCalledWith(VALID_UUID);
  });

  it('returns 404 when the source poster does not exist', async () => {
    vi.mocked(posterService.getById).mockRejectedValueOnce(
      new NotFoundError(`Poster not found: ${VALID_UUID}`),
    );

    const res = await request(app).get(`/api/posters/${VALID_UUID}/siblings`);

    expect(res.status).toBe(404);
    // getVisualSiblings must NOT be called if getById throws
    expect(posterService.getVisualSiblings).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid UUID', async () => {
    const res = await request(app).get(`/api/posters/${INVALID_UUID}/siblings`);

    expect(res.status).toBe(400);
    expect(posterService.getById).not.toHaveBeenCalled();
  });

  it('returns empty array when poster has no visual siblings', async () => {
    vi.mocked(posterService.getById).mockResolvedValueOnce(MOCK_POSTER);
    vi.mocked(posterService.getVisualSiblings).mockResolvedValueOnce([]);

    const res = await request(app).get(`/api/posters/${VALID_UUID}/siblings`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });
});

// ─── GET /api/series/:slug ────────────────────────────────────────────────────

describe('GET /api/series/:slug', () => {
  const app = buildApp();

  const MOCK_SERIES_PAGE = {
    series: {
      id: 'series-uuid',
      slug: 'wpa-posters',
      title: 'WPA Posters',
      description: null,
      nara_series_ref: null,
      poster_count: 5,
      created_at: '2026-01-01T00:00:00Z',
    },
    posters: [],
    total: 5,
    page: 1,
    limit: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with series page data', async () => {
    vi.mocked(posterService.getBySeriesSlug).mockResolvedValueOnce(MOCK_SERIES_PAGE);

    const res = await request(app).get('/api/series/wpa-posters');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: MOCK_SERIES_PAGE });
    expect(posterService.getBySeriesSlug).toHaveBeenCalledWith('wpa-posters', 1, 20);
  });

  it('passes page and limit query params to the service', async () => {
    vi.mocked(posterService.getBySeriesSlug).mockResolvedValueOnce({ ...MOCK_SERIES_PAGE, page: 3, limit: 10 });

    const res = await request(app).get('/api/series/wpa-posters?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(posterService.getBySeriesSlug).toHaveBeenCalledWith('wpa-posters', 3, 10);
  });

  it('returns 404 when the series slug does not exist', async () => {
    vi.mocked(posterService.getBySeriesSlug).mockRejectedValueOnce(
      new NotFoundError('Series not found: no-such-series'),
    );

    const res = await request(app).get('/api/series/no-such-series');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for an invalid slug format', async () => {
    // Slugs must be lowercase alphanumeric + hyphens; uppercase or special chars are invalid
    const res = await request(app).get('/api/series/INVALID_SLUG!');

    expect(res.status).toBe(400);
    expect(posterService.getBySeriesSlug).not.toHaveBeenCalled();
  });

  it('returns 400 when page is out of range', async () => {
    const res = await request(app).get('/api/series/wpa-posters?page=0');

    expect(res.status).toBe(400);
    expect(posterService.getBySeriesSlug).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds maximum', async () => {
    const res = await request(app).get('/api/series/wpa-posters?limit=999');

    expect(res.status).toBe(400);
    expect(posterService.getBySeriesSlug).not.toHaveBeenCalled();
  });
});
