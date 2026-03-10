import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
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

// ─── 429 rate-limit retry ──────────────────────────────────────────────────────

describe('rate-limit retry (429)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('retries once on 429 and returns valid embedding on second attempt', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockRun
      .mockRejectedValueOnce(new Error('Failed with status 429 Too Many Requests'))
      .mockResolvedValueOnce(VALID_EMBEDDING);

    const promise = generateTextEmbedding('test retry');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(VALID_EMBEDDING);
    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rate limited'));

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('uses retry_after from the 429 error message to set the wait duration', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timeoutSpy = vi.spyOn(global, 'setTimeout');

    // Error message contains "retry_after": 30 — extractRetryAfter should parse 30 → wait = 31s
    mockRun
      .mockRejectedValueOnce(new Error('Rate limited: {"retry_after": 30} status 429'))
      .mockResolvedValueOnce(VALID_EMBEDDING);

    const promise = generateTextEmbedding('test retry-after');
    await vi.runAllTimersAsync();
    await promise;

    // 30 (parsed) + 1 (buffer) = 31 seconds
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 31000);

    timeoutSpy.mockRestore();
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('falls back to 16-second wait when retry_after is absent from the 429 error', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timeoutSpy = vi.spyOn(global, 'setTimeout');

    // No "retry_after" in message → extractRetryAfter returns null → 15 + 1 = 16s
    mockRun
      .mockRejectedValueOnce(new Error('status 429 Too Many Requests'))
      .mockResolvedValueOnce(VALID_EMBEDDING);

    const promise = generateTextEmbedding('test default wait');
    await vi.runAllTimersAsync();
    await promise;

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 16000);

    timeoutSpy.mockRestore();
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('does NOT retry on non-429 errors (throws AIServiceError immediately)', async () => {
    mockRun.mockRejectedValueOnce(new Error('status 500 Internal Server Error'));

    await expect(generateTextEmbedding('test no-retry')).rejects.toThrow(AIServiceError);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('wraps object-shaped Replicate output via unwrapEmbedding', async () => {
    // Some Replicate models return { embedding: [...] } instead of a bare array
    mockRun.mockResolvedValueOnce({ embedding: VALID_EMBEDDING });

    const result = await generateTextEmbedding('test unwrap');

    expect(result).toHaveLength(768);
    expect(result).toBe(VALID_EMBEDDING);
  });

  it('logs unrecognised object keys and throws AIServiceError when no known embedding key is found', async () => {
    // Object returned has none of the recognised keys (embedding, embeddings, features, etc.)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRun.mockResolvedValueOnce({ data: VALID_EMBEDDING });

    await expect(generateTextEmbedding('test unrecognised')).rejects.toThrow(AIServiceError);
    expect(errSpy).toHaveBeenCalledWith(
      '[clipService] Unrecognised object shape — keys:',
      expect.arrayContaining(['data']),
    );

    errSpy.mockRestore();
  });
});
