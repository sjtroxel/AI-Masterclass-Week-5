import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIServiceError } from '../../middleware/errorHandler.js';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.hoisted() ensures these are available inside vi.mock() factory functions,
// which are hoisted to the top of the file before imports.

const mockRun = vi.hoisted(() => vi.fn());

vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({ run: mockRun })),
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    replicateApiKey: 'test-replicate-key',
    clipModelVersion: 'abc123def456',
  },
}));

// Imported AFTER mocks are declared so the module resolves against the mocks
import { generateTextEmbedding, generateImageEmbedding } from '../clipService.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EMBEDDING = Array.from({ length: 768 }, (_, i) => i / 768);

// Minimal 1×1 transparent PNG as a base64 data URI — bypasses the fetch path
const BASE64_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ─── generateTextEmbedding ────────────────────────────────────────────────────

describe('generateTextEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a 768-dimension array on success', async () => {
    mockRun.mockResolvedValueOnce(VALID_EMBEDDING);

    const result = await generateTextEmbedding('Buy War Bonds!');

    expect(result).toHaveLength(768);
    expect(result).toBe(VALID_EMBEDDING);
  });

  it('passes preprocessed (lowercased, punctuation-stripped) text to Replicate', async () => {
    mockRun.mockResolvedValueOnce(VALID_EMBEDDING);

    await generateTextEmbedding('Buy War-Bonds! Now.');

    const calledInput = mockRun.mock.calls[0]?.[1]?.input as { text: string };
    expect(calledInput.text).toBe('buy war bonds now');
  });

  it('throws AIServiceError when Replicate returns wrong dimension count', async () => {
    mockRun.mockResolvedValueOnce(Array.from({ length: 512 }, () => 0));

    await expect(generateTextEmbedding('test')).rejects.toThrow(AIServiceError);
  });

  it('throws AIServiceError when Replicate returns a non-array', async () => {
    mockRun.mockResolvedValueOnce('not-an-array');

    await expect(generateTextEmbedding('test')).rejects.toThrow(AIServiceError);
  });

  it('throws AIServiceError when the Replicate API call throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('API rate limited'));

    await expect(generateTextEmbedding('test')).rejects.toThrow(AIServiceError);
  });

  it('wraps Replicate error message in AIServiceError', async () => {
    mockRun.mockRejectedValueOnce(new Error('Service unavailable'));

    await expect(generateTextEmbedding('test')).rejects.toThrow('Service unavailable');
  });
});

// ─── generateImageEmbedding ───────────────────────────────────────────────────

describe('generateImageEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a 768-dimension array for a base64 data URI', async () => {
    mockRun.mockResolvedValueOnce(VALID_EMBEDDING);

    const result = await generateImageEmbedding(BASE64_IMAGE);

    expect(result).toHaveLength(768);
  });

  it('passes the base64 data URI directly to Replicate without fetching', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    mockRun.mockResolvedValueOnce(VALID_EMBEDDING);

    await generateImageEmbedding(BASE64_IMAGE);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches a URL, converts to base64, and passes it to Replicate', async () => {
    const fakeBuffer = new ArrayBuffer(4);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeBuffer),
      headers: { get: (_: string) => 'image/jpeg' },
    } as unknown as Response);
    mockRun.mockResolvedValueOnce(VALID_EMBEDDING);

    const result = await generateImageEmbedding('https://example.com/poster.jpg');

    expect(result).toHaveLength(768);
    expect(fetch).toHaveBeenCalledWith('https://example.com/poster.jpg');

    const calledInput = mockRun.mock.calls[0]?.[1]?.input as { image: string };
    expect(calledInput.image).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('throws AIServiceError when the image URL returns a non-OK HTTP response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as unknown as Response);

    await expect(
      generateImageEmbedding('https://example.com/missing.jpg'),
    ).rejects.toThrow(AIServiceError);
  });

  it('throws AIServiceError when Replicate returns wrong dimension count', async () => {
    mockRun.mockResolvedValueOnce(Array.from({ length: 512 }, () => 0));

    await expect(generateImageEmbedding(BASE64_IMAGE)).rejects.toThrow(AIServiceError);
  });

  it('throws AIServiceError when the Replicate API call throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('Service unavailable'));

    await expect(generateImageEmbedding(BASE64_IMAGE)).rejects.toThrow(AIServiceError);
  });
});
