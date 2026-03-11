import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { PosterResult } from '@poster-pilot/shared';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase.js', () => ({
  supabase: { rpc: mockRpc, from: vi.fn() },
}));

vi.mock('../clipService.js', () => ({
  generateTextEmbedding: vi.fn(),
  generateImageEmbedding: vi.fn(),
}));

vi.mock('../posterService.js', () => ({
  logSearchEvent: vi.fn(),
}));

vi.mock('../queryAnalyzer.js', () => ({
  analyzeQuery: vi.fn(),
  expandVibeQuery: vi.fn(),
}));

// Import after mocks are registered
import { textSearch, imageSearch, hybridSearch, vibeSearch } from '../searchService.js';
import { generateTextEmbedding, generateImageEmbedding } from '../clipService.js';
import { logSearchEvent } from '../posterService.js';
import { expandVibeQuery } from '../queryAnalyzer.js';
import type { QueryAnalysis } from '../queryAnalyzer.js';
import { DatabaseError } from '../../middleware/errorHandler.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_EMBEDDING = Array.from({ length: 768 }, () => 0.1);

function makePoster(id: string, similarityScore: number, overallConfidence = 0.9): PosterResult {
  return {
    id,
    nara_id: `nara-${id}`,
    title: `Poster ${id}`,
    date_created: null,
    creator: null,
    thumbnail_url: `https://example.com/${id}.jpg`,
    series_title: null,
    overall_confidence: overallConfidence,
    similarity_score: similarityScore,
  };
}

const HIGH_RESULT = makePoster('p1', 0.92);      // high confidence (≥ 0.85)
const MEDIUM_RESULT = makePoster('p2', 0.78);    // medium confidence (0.72–0.84)
const LOW_CONF_RESULT = makePoster('p3', 0.88, 0.60); // below ai_confidence threshold

const TEXT_ANALYSIS: QueryAnalysis = {
  mode: 'text',
  seriesIntent: null,
  dateIntent: null,
  processedQuery: 'wpa labor posters',
};

const CTX = { sessionId: 'test-session-id' };

// ─── textSearch ───────────────────────────────────────────────────────────────

describe('textSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (generateTextEmbedding as Mock).mockResolvedValue(MOCK_EMBEDDING);
  });

  it('returns results with correct confidence_level when all scores are high', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.confidence_level).toBe('high');
    expect(response.human_handoff_needed).toBe(false);
  });

  it('returns medium confidence_level for scores in the 0.72–0.84 range', async () => {
    mockRpc.mockResolvedValue({ data: [MEDIUM_RESULT], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.results[0]?.confidence_level).toBe('medium');
    expect(response.human_handoff_needed).toBe(false);
  });

  it('sets handoff_needed: true and reason: low_similarity when result set is empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.human_handoff_needed).toBe(true);
    expect(response.handoff_reason).toBe('low_similarity');
    expect(response.results).toHaveLength(0);
  });

  it('does NOT set handoff_needed when top result has high similarity despite low overall_confidence', async () => {
    // LOW_CONF_RESULT has similarity_score=0.88 but overall_confidence=0.60.
    // overall_confidence is no longer used for the handoff decision — only
    // similarity_score matters. Score 0.88 is well above the 0.20 floor.
    mockRpc.mockResolvedValue({ data: [LOW_CONF_RESULT], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.human_handoff_needed).toBe(false);
  });

  it('sets handoff_needed: true and reason: low_similarity when top similarity_score < 0.20', async () => {
    const veryLowResult = makePoster('p-very-low', 0.15);
    mockRpc.mockResolvedValue({ data: [veryLowResult], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.human_handoff_needed).toBe(true);
    expect(response.handoff_reason).toBe('low_similarity');
  });

  it('calls generateTextEmbedding with the processed query', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await textSearch(TEXT_ANALYSIS, CTX);

    expect(generateTextEmbedding).toHaveBeenCalledWith('wpa labor posters');
  });

  it('calls match_posters RPC with the correct parameters', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await textSearch(TEXT_ANALYSIS, { sessionId: 'sess', seriesFilter: 'wpa-posters', limit: 10 });

    expect(mockRpc).toHaveBeenCalledWith('match_posters', {
      query_embedding: MOCK_EMBEDDING,
      match_threshold: 0.1,
      match_count: 10,
      series_filter: 'wpa-posters',
    });
  });

  it('defaults match_count to 20 when limit is not provided', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await textSearch(TEXT_ANALYSIS, CTX);

    expect(mockRpc).toHaveBeenCalledWith('match_posters', expect.objectContaining({
      match_count: 20,
    }));
  });

  it('fires logSearchEvent asynchronously (does not throw if logging fails)', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });
    (logSearchEvent as Mock).mockImplementation(() => { /* fire-and-forget */ });

    await expect(textSearch(TEXT_ANALYSIS, CTX)).resolves.toBeDefined();
    expect(logSearchEvent).toHaveBeenCalledOnce();
  });

  it('sets query_mode: text in the response', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.query_mode).toBe('text');
  });

  it('returns confidence_level: low for results below the handoff threshold (0.72)', async () => {
    // CLIP_SEARCH_FLOOR is 0.1, so results with scores below 0.72 can be returned
    const lowSimilarityResult = makePoster('p-low', 0.65);
    mockRpc.mockResolvedValue({ data: [lowSimilarityResult], error: null });

    const response = await textSearch(TEXT_ANALYSIS, CTX);

    expect(response.results[0]?.confidence_level).toBe('low');
    // similarity_score 0.65 is above the 0.20 floor, so no handoff is triggered
    expect(response.human_handoff_needed).toBe(false);
  });

  it('throws DatabaseError when the match_posters RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'pgvector index corrupt' } });

    await expect(textSearch(TEXT_ANALYSIS, CTX)).rejects.toThrow(DatabaseError);
    await expect(textSearch(TEXT_ANALYSIS, CTX)).rejects.toThrow('pgvector index corrupt');
  });
});

// ─── imageSearch ──────────────────────────────────────────────────────────────

describe('imageSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (generateImageEmbedding as Mock).mockResolvedValue(MOCK_EMBEDDING);
  });

  it('returns results with similarity_score from the RPC response', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    const response = await imageSearch('data:image/jpeg;base64,abc123', CTX);

    expect(response.results[0]?.similarity_score).toBe(0.92);
  });

  it('sets handoff_needed: true when result set is empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await imageSearch('data:image/jpeg;base64,abc123', CTX);

    expect(response.human_handoff_needed).toBe(true);
    expect(response.handoff_reason).toBe('low_similarity');
  });

  it('calls generateImageEmbedding with the raw image string', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });
    const image = 'data:image/jpeg;base64,abc123';

    await imageSearch(image, CTX);

    expect(generateImageEmbedding).toHaveBeenCalledWith(image);
  });

  it('sets query_mode: image in the response', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    const response = await imageSearch('data:image/jpeg;base64,abc123', CTX);

    expect(response.query_mode).toBe('image');
  });

  it('logs the search event with null query_text', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await imageSearch('data:image/jpeg;base64,abc123', CTX);

    expect(logSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ query_text: null, query_mode: 'image' }),
    );
  });
});

// ─── hybridSearch ─────────────────────────────────────────────────────────────

describe('hybridSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (generateTextEmbedding as Mock).mockResolvedValue(MOCK_EMBEDDING);
    (generateImageEmbedding as Mock).mockResolvedValue(MOCK_EMBEDDING);
  });

  it('calls both generateTextEmbedding and generateImageEmbedding', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await hybridSearch(TEXT_ANALYSIS, 'data:image/jpeg;base64,abc123', CTX);

    expect(generateTextEmbedding).toHaveBeenCalledOnce();
    expect(generateImageEmbedding).toHaveBeenCalledOnce();
  });

  it('deduplicates results that appear in both text and image result sets', async () => {
    const p1 = makePoster('p1', 0.90);
    const p2 = makePoster('p2', 0.85);
    // RPC is called twice (once per embedding); both return p1 — merged should deduplicate
    mockRpc
      .mockResolvedValueOnce({ data: [p1, p2], error: null }) // image results
      .mockResolvedValueOnce({ data: [p1, p2], error: null }); // text results

    const response = await hybridSearch(TEXT_ANALYSIS, 'data:image/jpeg;base64,abc123', CTX);

    const ids = response.results.map((r) => r.poster.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ranks visual-only results above text-only results at equal rank due to 60/40 weights', async () => {
    const visualOnly = makePoster('visual', 0.88);
    const textOnly = makePoster('text', 0.88);

    // hybridSearch runs Promise.all([textEmbedding, imageEmbedding]) then
    // Promise.all([runMatchPosters(text), runMatchPosters(image)]).
    // The first mockRpc call resolves textMatches; the second resolves imageMatches.
    // We want imageMatches (weight 0.6) to contain visualOnly so it wins.
    mockRpc
      .mockResolvedValueOnce({ data: [textOnly], error: null })    // 1st call → textMatches (0.4)
      .mockResolvedValueOnce({ data: [visualOnly], error: null }); // 2nd call → imageMatches (0.6)

    const response = await hybridSearch(TEXT_ANALYSIS, 'data:image/jpeg;base64,abc123', CTX);

    expect(response.results[0]?.poster.id).toBe('visual');
    expect(response.results[1]?.poster.id).toBe('text');
  });

  it('sets handoff_needed: true when both result sets are empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await hybridSearch(TEXT_ANALYSIS, 'data:image/jpeg;base64,abc123', CTX);

    expect(response.human_handoff_needed).toBe(true);
  });

  it('sets query_mode: hybrid in the response', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    const response = await hybridSearch(TEXT_ANALYSIS, 'data:image/jpeg;base64,abc123', CTX);

    expect(response.query_mode).toBe('hybrid');
  });
});

// ─── vibeSearch ───────────────────────────────────────────────────────────────

describe('vibeSearch', () => {
  const EXPANSIONS = [
    'workers raising steel beams',
    'bold typography red and yellow',
    'crowds cheering at factories',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (expandVibeQuery as Mock).mockResolvedValue(EXPANSIONS);
    (generateTextEmbedding as Mock).mockResolvedValue(MOCK_EMBEDDING);
  });

  it('calls expandVibeQuery before embedding — vibe is NOT the same as hybridSearch', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await vibeSearch(TEXT_ANALYSIS, CTX);

    // expandVibeQuery must be called with the processed query
    expect(expandVibeQuery).toHaveBeenCalledWith('wpa labor posters');
    // No image embedding — vibe is pure text
    expect(generateImageEmbedding).not.toHaveBeenCalled();
  });

  it('calls generateTextEmbedding once per expansion phrase', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await vibeSearch(TEXT_ANALYSIS, CTX);

    expect(generateTextEmbedding).toHaveBeenCalledTimes(EXPANSIONS.length);
    expect(generateTextEmbedding).toHaveBeenCalledWith(EXPANSIONS[0]);
    expect(generateTextEmbedding).toHaveBeenCalledWith(EXPANSIONS[1]);
    expect(generateTextEmbedding).toHaveBeenCalledWith(EXPANSIONS[2]);
  });

  it('calls match_posters once per expansion phrase', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    await vibeSearch(TEXT_ANALYSIS, CTX);

    expect(mockRpc).toHaveBeenCalledTimes(EXPANSIONS.length);
  });

  it('deduplicates posters that appear across multiple expansion results', async () => {
    const p1 = makePoster('p1', 0.92);
    const p2 = makePoster('p2', 0.85);
    // All three expansions return the same two posters
    mockRpc.mockResolvedValue({ data: [p1, p2], error: null });

    const response = await vibeSearch(TEXT_ANALYSIS, CTX);

    const ids = response.results.map((r) => r.poster.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it('sets handoff_needed: true when all expansion searches return empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await vibeSearch(TEXT_ANALYSIS, CTX);

    expect(response.human_handoff_needed).toBe(true);
  });

  it('sets query_mode: vibe in the response', async () => {
    mockRpc.mockResolvedValue({ data: [HIGH_RESULT], error: null });

    const response = await vibeSearch(TEXT_ANALYSIS, CTX);

    expect(response.query_mode).toBe('vibe');
  });

  it('propagates AIServiceError if expandVibeQuery fails', async () => {
    const { AIServiceError } = await import('../../middleware/errorHandler.js');
    (expandVibeQuery as Mock).mockRejectedValue(new AIServiceError('expansion failed'));

    await expect(vibeSearch(TEXT_ANALYSIS, CTX)).rejects.toThrow('expansion failed');
  });
});
