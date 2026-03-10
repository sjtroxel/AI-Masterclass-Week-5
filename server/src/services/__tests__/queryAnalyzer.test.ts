import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { analyzeQuery, expandVibeQuery } from '../queryAnalyzer.js';
import { AIServiceError } from '../../middleware/errorHandler.js';

// ─── Mock config — prevents process.exit(1) in CI where no .env is present ───
// queryAnalyzer.ts imports config at the module level; without this mock the
// real config.ts runs its Zod validation, finds no env vars, and calls process.exit.

vi.mock('../../lib/config.js', () => ({
  config: { anthropicApiKey: 'test-api-key' },
}));

// ─── Mock Anthropic SDK ───────────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn(() => ({
    messages: { create: mockCreate },
  }));
  (MockAnthropic as unknown as Record<string, unknown>)._mockCreate = mockCreate;
  return { default: MockAnthropic };
});

// Helper to reach the mocked `create` function without re-importing Anthropic.
// noUncheckedIndexedAccess requires the non-null assertion here.
async function getMockCreate(): Promise<Mock> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return (Anthropic as unknown as Record<string, Mock>)._mockCreate!;
}

// ─── analyzeQuery ─────────────────────────────────────────────────────────────

describe('analyzeQuery', () => {
  describe('mode detection', () => {
    it('returns text mode for a plain keyword query', () => {
      const result = analyzeQuery('WPA labor posters');
      expect(result.mode).toBe('text');
    });

    it('returns vibe mode when the query contains "aesthetic"', () => {
      const result = analyzeQuery('dark moody aesthetic wartime');
      expect(result.mode).toBe('vibe');
    });

    it('returns vibe mode when the query contains "nostalgic"', () => {
      const result = analyzeQuery('nostalgic 1940s imagery');
      expect(result.mode).toBe('vibe');
    });

    it('returns vibe mode when the query contains "art deco"', () => {
      const result = analyzeQuery('art deco travel posters');
      expect(result.mode).toBe('vibe');
    });

    it('is case-insensitive for vibe keyword detection', () => {
      const result = analyzeQuery('RETRO space imagery');
      expect(result.mode).toBe('vibe');
    });
  });

  describe('series intent detection', () => {
    it('detects wpa-posters series from "WPA" keyword', () => {
      const result = analyzeQuery('WPA labor posters from the depression');
      expect(result.seriesIntent).toBe('wpa-posters');
    });

    it('detects wpa-posters series from "federal art project"', () => {
      const result = analyzeQuery('federal art project murals');
      expect(result.seriesIntent).toBe('wpa-posters');
    });

    it('detects nasa-history series from "NASA" keyword', () => {
      const result = analyzeQuery('NASA Apollo mission posters');
      expect(result.seriesIntent).toBe('nasa-history');
    });

    it('detects nasa-history series from "astronaut"', () => {
      const result = analyzeQuery('astronaut portraits');
      expect(result.seriesIntent).toBe('nasa-history');
    });

    it('detects patent-medicine series from "patent medicine"', () => {
      const result = analyzeQuery('patent medicine advertisements');
      expect(result.seriesIntent).toBe('patent-medicine');
    });

    it('detects wwii-propaganda series from "WWII" keyword', () => {
      const result = analyzeQuery('WWII home front posters');
      expect(result.seriesIntent).toBe('wwii-propaganda');
    });

    it('detects wwii-propaganda from "war effort"', () => {
      const result = analyzeQuery('war effort recruitment imagery');
      expect(result.seriesIntent).toBe('wwii-propaganda');
    });

    it('returns null when no series keywords match', () => {
      const result = analyzeQuery('bold typography and color');
      expect(result.seriesIntent).toBeNull();
    });
  });

  describe('date intent detection', () => {
    it('detects a decade like "1940s"', () => {
      const result = analyzeQuery('posters from the 1940s');
      expect(result.dateIntent).toBe('1940s');
    });

    it('detects a decade like "1890s"', () => {
      const result = analyzeQuery('1890s patent remedy ads');
      expect(result.dateIntent).toBe('1890s');
    });

    it('detects a year range like "1941-1945"', () => {
      const result = analyzeQuery('wartime posters 1941-1945');
      expect(result.dateIntent).toBe('1941-1945');
    });

    it('returns null when no date is mentioned', () => {
      const result = analyzeQuery('colorful travel posters');
      expect(result.dateIntent).toBeNull();
    });
  });

  describe('processedQuery', () => {
    it('lowercases and trims the query', () => {
      const result = analyzeQuery('  WPA Labor Posters  ');
      expect(result.processedQuery).toBe('wpa labor posters');
    });

    it('preserves the lowercase form for downstream CLIP preprocessing', () => {
      const result = analyzeQuery('NASA Space Exploration');
      expect(result.processedQuery).toBe('nasa space exploration');
    });
  });
});

// ─── expandVibeQuery ──────────────────────────────────────────────────────────

describe('expandVibeQuery', () => {
  let mockCreate: Mock;

  beforeEach(async () => {
    mockCreate = await getMockCreate();
    mockCreate.mockReset();
  });

  it('returns a valid 3–5 item string array on success', async () => {
    const expansions = [
      'workers raising steel beams against blue sky',
      'smiling factory workers in overalls',
      'bold geometric shapes in red and yellow',
      'crowds cheering at construction sites',
    ];

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(expansions) }],
    });

    const result = await expandVibeQuery('industrial optimism');
    expect(result).toEqual(expansions);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.every((s) => typeof s === 'string')).toBe(true);
  });

  it('accepts exactly 3 items (minimum boundary)', async () => {
    const expansions = ['description one', 'description two', 'description three'];
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(expansions) }],
    });

    const result = await expandVibeQuery('melancholy');
    expect(result).toHaveLength(3);
  });

  it('accepts exactly 5 items (maximum boundary)', async () => {
    const expansions = ['a', 'b', 'c', 'd', 'e'];
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(expansions) }],
    });

    const result = await expandVibeQuery('bold');
    expect(result).toHaveLength(5);
  });

  it('strips markdown code fences before parsing', async () => {
    const expansions = ['vibrant street scene', 'colorful market stalls', 'busy urban life'];
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(expansions)}\n\`\`\`` }],
    });

    const result = await expandVibeQuery('urban life');
    expect(result).toEqual(expansions);
  });

  it('throws AIServiceError when the model returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not JSON' }],
    });

    await expect(expandVibeQuery('retro vibes')).rejects.toThrow(AIServiceError);
    await expect(expandVibeQuery('retro vibes')).rejects.toThrow('invalid JSON');
  });

  it('throws AIServiceError when the array has fewer than 3 items', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(['only one item', 'two items']) }],
    });

    await expect(expandVibeQuery('minimalist')).rejects.toThrow(AIServiceError);
  });

  it('truncates to MAX_VIBE_EXPANSIONS when the model returns more than 5 items', async () => {
    const tooMany = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(tooMany) }],
    });

    const result = await expandVibeQuery('maximalist');
    expect(result).toHaveLength(5);
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('throws AIServiceError when the model returns a non-array JSON value', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"key": "value"}' }],
    });

    await expect(expandVibeQuery('abstract')).rejects.toThrow(AIServiceError);
  });

  it('wraps Anthropic API errors as AIServiceError', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(expandVibeQuery('somber')).rejects.toThrow(AIServiceError);
    await expect(expandVibeQuery('somber')).rejects.toThrow('model call failed');
  });

  it('re-throws AIServiceError without double-wrapping', async () => {
    const original = new AIServiceError('upstream failure');
    mockCreate.mockRejectedValue(original);

    await expect(expandVibeQuery('vibe')).rejects.toThrow('upstream failure');
  });

  it('throws AIServiceError when the model response has no content block (empty content array)', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    await expect(expandVibeQuery('ethereal')).rejects.toThrow(AIServiceError);
    await expect(expandVibeQuery('ethereal')).rejects.toThrow('unexpected response structure');
  });

  it('throws AIServiceError when array contains empty-string items (detail includes item count)', async () => {
    // Array has 3 items but one is '' → fails the non-empty string guard → detail = "3 items"
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(['valid description', '', 'another valid']) }],
    });

    const err = await expandVibeQuery('dark').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AIServiceError);
    expect((err as AIServiceError).message).toContain('3 items');
  });
});
