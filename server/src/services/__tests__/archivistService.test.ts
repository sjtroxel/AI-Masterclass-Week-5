import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { Response } from 'express';
import { AIServiceError, DatabaseError, SessionExpiredError } from '../../middleware/errorHandler.js';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockSupabaseFrom = vi.hoisted(() => vi.fn());
const mockMaybeSingle = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockIn = vi.hoisted(() => vi.fn());
const mockUpsert = vi.hoisted(() => vi.fn());

// Anthropic SDK mocks
const mockMessagesCreate = vi.hoisted(() => vi.fn());
const mockMessagesStream = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: mockSupabaseFrom },
}));

vi.mock('../../lib/config.js', () => ({
  config: { anthropicApiKey: 'test-anthropic-key' },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
      stream: mockMessagesStream,
    },
  })),
}));

// Import AFTER mocks
import {
  estimateTokens,
  isApproachingBudget,
  extractCitations,
  buildContextBlock,
  assembleSystemPrompt,
  loadSession,
  saveSession,
  compressHistory,
  streamResponse,
} from '../archivistService.js';
import type { ArchivistSession } from '@poster-pilot/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeSession(overrides: Partial<ArchivistSession> = {}): ArchivistSession {
  const now = new Date().toISOString();
  return {
    id: VALID_UUID,
    session_id: SESSION_ID,
    messages: [],
    poster_context: [],
    turn_count: 0,
    total_tokens: 0,
    archivist_expressed_uncertainty: false,
    handoff_prompted_at: null,
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function makeStreamMock(textChunks: string[]) {
  let textCallback: ((text: string) => void) | null = null;

  const streamObj = {
    on: vi.fn().mockImplementation((event: string, cb: (text: string) => void) => {
      if (event === 'text') textCallback = cb;
      return streamObj;
    }),
    finalMessage: vi.fn().mockImplementation(async () => {
      // Fire text callbacks synchronously before resolving
      for (const chunk of textChunks) {
        textCallback?.(chunk);
      }
      return {
        content: [{ type: 'text', text: textChunks.join('') }],
        usage: { input_tokens: 120, output_tokens: 45 },
      };
    }),
  };

  return streamObj;
}

function makeMockResponse() {
  return {
    headersSent: false,
    write: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
  };
}

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns Math.ceil(length / 4)', () => {
    expect(estimateTokens('abcd')).toBe(1);    // 4 chars → 1 token
    expect(estimateTokens('abcde')).toBe(2);   // 5 chars → ceil(1.25) = 2
    expect(estimateTokens('')).toBe(0);
  });
});

// ─── isApproachingBudget ──────────────────────────────────────────────────────

describe('isApproachingBudget', () => {
  it('returns false when well within budget', () => {
    const session = makeSession({ messages: [] });
    expect(isApproachingBudget(session, 300)).toBe(false);
  });

  it('returns true when total exceeds 8,000 tokens', () => {
    // Fill history to push us over the limit.
    // system(400) + context(1500) + history + response(900) > 8000
    // → history must exceed 5200 tokens → ~20,800 chars
    const longContent = 'x'.repeat(21_000);
    const session = makeSession({
      messages: [{ role: 'user', content: longContent, timestamp: '' }],
    });
    expect(isApproachingBudget(session, 5 * 300)).toBe(true);
  });
});

// ─── extractCitations ─────────────────────────────────────────────────────────

describe('extractCitations', () => {
  it('returns [] when text contains no known nara_ids', () => {
    const result = extractCitations('No references here.', ['NAID-001', 'dpla-xyz']);
    expect(result).toEqual([]);
  });

  it('returns a single citation when one nara_id appears in text', () => {
    const result = extractCitations('The poster NAID-001 is from 1942.', ['NAID-001', 'dpla-xyz']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ nara_id: 'NAID-001', field: 'nara_id', value: 'NAID-001' });
  });

  it('returns multiple citations for multiple nara_ids, no duplicates', () => {
    const text = 'See NAID-001 and dpla-xyz for reference. NAID-001 is mentioned twice.';
    const result = extractCitations(text, ['NAID-001', 'dpla-xyz', 'NAID-999']);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.nara_id)).toEqual(['NAID-001', 'dpla-xyz']);
  });

  it('handles empty nara_ids list gracefully', () => {
    const result = extractCitations('Some text', []);
    expect(result).toEqual([]);
  });
});

// ─── assembleSystemPrompt ─────────────────────────────────────────────────────

describe('assembleSystemPrompt', () => {
  it('injects context block into prompt', () => {
    const prompt = assembleSystemPrompt('<poster>test</poster>', false);
    expect(prompt).toContain('<poster>test</poster>');
    expect(prompt).toContain('You are The Archivist');
  });

  it('appends the confidence clause when lowConfidence is true', () => {
    const prompt = assembleSystemPrompt('ctx', true);
    expect(prompt).toContain('IMPORTANT: The similarity scores');
    expect(prompt).toContain('confidence threshold');
  });

  it('does NOT append the confidence clause when lowConfidence is false', () => {
    const prompt = assembleSystemPrompt('ctx', false);
    expect(prompt).not.toContain('IMPORTANT: The similarity scores');
  });
});

// ─── buildContextBlock ────────────────────────────────────────────────────────

describe('buildContextBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty string when poster_ids is empty', async () => {
    const result = await buildContextBlock([]);
    expect(result).toBe('');
  });

  it('returns XML poster block with similarity score', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        in: mockIn.mockResolvedValue({
          data: [
            {
              id: VALID_UUID,
              nara_id: 'NAID-001',
              title: 'Buy War Bonds',
              creator: 'Federal Art Project',
              date_created: 'ca. 1942',
              series_title: 'WPA Posters',
              description: 'A bold graphic.',
              subject_tags: ['WWII', 'War Bonds'],
              physical_description: 'Silkscreen',
              overall_confidence: 0.91,
            },
          ],
          error: null,
        }),
      }),
    });

    const block = await buildContextBlock([VALID_UUID], { [VALID_UUID]: 0.88 });

    expect(block).toContain('nara_id="NAID-001"');
    expect(block).toContain('similarity_score="0.880"');
    expect(block).toContain('<title>Buy War Bonds</title>');
    expect(block).toContain('<subjects>WWII, War Bonds</subjects>');
  });

  it('throws DatabaseError on Supabase failure', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        in: mockIn.mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    });

    await expect(buildContextBlock([VALID_UUID])).rejects.toThrow(DatabaseError);
  });

  it('returns empty string when poster_ids are provided but the DB returns no rows', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        in: mockIn.mockResolvedValue({ data: [], error: null }),
      }),
    });

    const block = await buildContextBlock([VALID_UUID]);

    expect(block).toBe('');
  });

  it('renders empty subjects string when subject_tags is null', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        in: mockIn.mockResolvedValue({
          data: [
            {
              id: VALID_UUID,
              nara_id: 'NAID-002',
              title: 'No Tags Poster',
              creator: null,
              date_created: null,
              series_title: null,
              description: null,
              subject_tags: null,   // triggers the '' else branch in subjects ternary
              physical_description: null,
              overall_confidence: 0.80,
            },
          ],
          error: null,
        }),
      }),
    });

    const block = await buildContextBlock([VALID_UUID]);

    expect(block).toContain('nara_id="NAID-002"');
    expect(block).toContain('<subjects></subjects>');
  });
});

// ─── loadSession ──────────────────────────────────────────────────────────────

describe('loadSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a fresh empty session when none found in DB', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle.mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const session = await loadSession(SESSION_ID);
    expect(session.session_id).toBe(SESSION_ID);
    expect(session.messages).toEqual([]);
    expect(session.turn_count).toBe(0);
  });

  it('loads and returns an existing session', async () => {
    const stored = makeSession({ turn_count: 3 });
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle.mockResolvedValue({ data: stored, error: null }),
        }),
      }),
    });

    const session = await loadSession(SESSION_ID);
    expect(session.turn_count).toBe(3);
  });

  it('throws ValidationError for an expired session', async () => {
    const expired = makeSession({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle.mockResolvedValue({ data: expired, error: null }),
        }),
      }),
    });

    await expect(loadSession(SESSION_ID)).rejects.toThrow(SessionExpiredError);
  });

  it('throws DatabaseError on Supabase failure', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle.mockResolvedValue({
            data: null,
            error: { message: 'Connection refused' },
          }),
        }),
      }),
    });

    await expect(loadSession(SESSION_ID)).rejects.toThrow(DatabaseError);
  });
});

// ─── saveSession ──────────────────────────────────────────────────────────────

describe('saveSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts the session with session_id as conflict key', async () => {
    mockSupabaseFrom.mockReturnValue({
      upsert: mockUpsert.mockResolvedValue({ error: null }),
    });

    await saveSession(makeSession());

    expect(mockSupabaseFrom).toHaveBeenCalledWith('archivist_sessions');
    const upsertCall = mockUpsert.mock.calls[0];
    expect(upsertCall?.[1]).toEqual({ onConflict: 'session_id' });
  });

  it('throws DatabaseError on upsert failure', async () => {
    mockSupabaseFrom.mockReturnValue({
      upsert: mockUpsert.mockResolvedValue({ error: { message: 'unique violation' } }),
    });

    await expect(saveSession(makeSession())).rejects.toThrow(DatabaseError);
  });
});

// ─── compressHistory ──────────────────────────────────────────────────────────

describe('compressHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the session unchanged when messages.length <= 4', async () => {
    const session = makeSession({
      messages: [
        { role: 'user', content: 'Hello', timestamp: '' },
        { role: 'assistant', content: 'Hi', timestamp: '' },
      ],
    });
    const result = await compressHistory(session);
    expect(result.messages).toHaveLength(2);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('calls Claude to summarize oldest messages and preserves 4 most recent', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary of earlier talk.' }],
    });

    const messages = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
      timestamp: '',
    }));
    const session = makeSession({ messages });

    const result = await compressHistory(session);

    expect(mockMessagesCreate).toHaveBeenCalledOnce();
    // 1 summary + 4 preserved = 5 total
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0]?.content).toContain('[EARLIER CONTEXT SUMMARIZED]');
    expect(result.messages[0]?.content).toContain('Summary of earlier talk.');
  });

  it('fires history compression when token budget is approached (integration)', async () => {
    // isApproachingBudget → true → compressHistory fires
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Compressed.' }],
    });

    const longContent = 'x'.repeat(21_000);
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: i === 0 ? longContent : `msg ${i}`,
      timestamp: '',
    }));
    const session = makeSession({ messages });

    // Verify the budget check fires
    expect(isApproachingBudget(session, 5 * 300)).toBe(true);

    const compressed = await compressHistory(session);
    expect(compressed.messages.length).toBeLessThan(messages.length);
  });

  it('throws AIServiceError when Claude returns unexpected content type', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'image_url', url: 'http://example.com' }],
    });

    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: '',
    }));
    await expect(compressHistory(makeSession({ messages }))).rejects.toThrow(AIServiceError);
  });
});

// ─── streamResponse ───────────────────────────────────────────────────────────

describe('streamResponse', () => {
  // vi.clearAllMocks() only clears call history — it does NOT drain mockReturnValueOnce
  // queues. Use mockReset() on each shared mock so queued values don't bleed between tests.
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockMaybeSingle.mockReset();
    mockIn.mockReset();
    mockUpsert.mockReset();
    mockMessagesCreate.mockReset();
    mockMessagesStream.mockReset();
  });

  // ── Mock helpers ────────────────────────────────────────────────────────────

  /** Queues a session-load mock returning `session` (or null → fresh session). */
  function mockLoadSession(session: ArchivistSession | null) {
    mockSupabaseFrom.mockReturnValueOnce({
      select: mockSelect.mockReturnValueOnce({
        eq: mockEq.mockReturnValueOnce({
          maybeSingle: mockMaybeSingle.mockResolvedValueOnce({ data: session, error: null }),
        }),
      }),
    });
  }

  /** Queues a fetchPosterContext mock returning the given poster rows. */
  function mockFetchContext(rows: unknown[] = []) {
    mockSupabaseFrom.mockReturnValueOnce({
      select: mockSelect.mockReturnValueOnce({
        in: mockIn.mockResolvedValueOnce({ data: rows, error: null }),
      }),
    });
  }

  /** Queues a saveSession mock that succeeds. */
  function mockSaveSession() {
    mockSupabaseFrom.mockReturnValueOnce({
      upsert: mockUpsert.mockResolvedValueOnce({ error: null }),
    });
  }

  it('streams delta events and sends a final done event', async () => {
    // posterContextIds: [] → fetchPosterContext exits early (no Supabase call)
    mockLoadSession(null);
    mockSaveSession();
    mockMessagesStream.mockReturnValueOnce(makeStreamMock(['Hello ', 'world.']));

    const res = makeMockResponse();
    const next = vi.fn();

    await streamResponse(
      { sessionId: SESSION_ID, message: 'Tell me about WPA.', posterContextIds: [], posterSimilarityScores: {} },
      res as unknown as Response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledOnce();

    const writes = (res.write as Mock).mock.calls.map((c) => c[0] as string);
    const deltaEvents = writes.filter((w) => w.includes('"delta"'));
    expect(deltaEvents.length).toBeGreaterThan(0);
    const doneEvent = writes.find((w) => w.includes('"done":true'));
    expect(doneEvent).toBeDefined();
    expect(doneEvent).toContain('"citations"');
    expect(doneEvent).toContain('"confidence"');
  });

  it('calls Anthropic with exactly temperature: 0.2 and max_tokens: 900', async () => {
    mockLoadSession(null);
    mockSaveSession();
    mockMessagesStream.mockReturnValueOnce(makeStreamMock(['Response.']));

    await streamResponse(
      { sessionId: SESSION_ID, message: 'Hello', posterContextIds: [], posterSimilarityScores: {} },
      makeMockResponse() as unknown as Response,
      vi.fn(),
    );

    expect(mockMessagesStream).toHaveBeenCalledOnce();
    const callArgs = mockMessagesStream.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['temperature']).toBe(0.2);
    expect(callArgs['max_tokens']).toBe(900);
    expect(callArgs['model']).toBe('claude-sonnet-4-6');
  });

  it('appends the confidence clause to system prompt when similarity_score < 0.72', async () => {
    mockLoadSession(null);
    mockFetchContext([
      {
        id: VALID_UUID,
        nara_id: 'NAID-001',
        title: 'Test Poster',
        creator: null,
        date_created: null,
        series_title: null,
        description: null,
        subject_tags: [],
        physical_description: null,
        overall_confidence: 0.65,
      },
    ]);
    mockSaveSession();
    mockMessagesStream.mockReturnValueOnce(makeStreamMock(['Low confidence response.']));

    await streamResponse(
      {
        sessionId: SESSION_ID,
        message: 'Tell me about this poster.',
        posterContextIds: [VALID_UUID],
        posterSimilarityScores: { [VALID_UUID]: 0.65 }, // below 0.72
      },
      makeMockResponse() as unknown as Response,
      vi.fn(),
    );

    const callArgs = mockMessagesStream.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['system']).toContain('IMPORTANT: The similarity scores');
  });

  it('session is created on first call and persisted via upsert', async () => {
    mockLoadSession(null); // no existing session → fresh session
    mockSaveSession();
    mockMessagesStream.mockReturnValueOnce(makeStreamMock(['First response.']));

    await streamResponse(
      { sessionId: SESSION_ID, message: 'First turn.', posterContextIds: [], posterSimilarityScores: {} },
      makeMockResponse() as unknown as Response,
      vi.fn(),
    );

    expect(mockUpsert).toHaveBeenCalledOnce();
    const savedData = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(savedData['session_id']).toBe(SESSION_ID);
    expect(savedData['turn_count']).toBe(1);
  });

  it('sends an SSE error event and calls next() on mid-stream error (plain Error)', async () => {
    // posterContextIds: [] → no fetchPosterContext Supabase call
    // Stream errors before saveSession → no saveSession call needed
    mockLoadSession(null);
    const streamObj = {
      on: vi.fn().mockImplementation((_event: string, _cb: unknown) => streamObj),
      finalMessage: vi.fn().mockRejectedValue(new Error('Anthropic timeout')),
    };
    mockMessagesStream.mockReturnValueOnce(streamObj);

    const res = makeMockResponse();
    res.headersSent = true; // headers already flushed — SSE error event expected
    const next = vi.fn();

    await streamResponse(
      { sessionId: SESSION_ID, message: 'Hello', posterContextIds: [], posterSimilarityScores: {} },
      res as unknown as Response,
      next,
    );

    expect(res.write).toHaveBeenCalled();
    const writes = (res.write as Mock).mock.calls.map((c) => c[0] as string);
    expect(writes.some((w) => w.includes('"error"'))).toBe(true);
    // Non-AppError → code should be 'STREAM_ERROR', message the generic fallback
    expect(writes.some((w) => w.includes('STREAM_ERROR'))).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it('sends AppError code and message in the SSE error event when the thrown error is an AppError', async () => {
    // Covers the `err instanceof AppError` true branch at lines 404-405
    mockLoadSession(null);
    const streamObj = {
      on: vi.fn().mockImplementation((_event: string, _cb: unknown) => streamObj),
      finalMessage: vi.fn().mockRejectedValue(new AIServiceError('Replicate quota exceeded')),
    };
    mockMessagesStream.mockReturnValueOnce(streamObj);

    const res = makeMockResponse();
    res.headersSent = true;
    const next = vi.fn();

    await streamResponse(
      { sessionId: SESSION_ID, message: 'Hello', posterContextIds: [], posterSimilarityScores: {} },
      res as unknown as Response,
      next,
    );

    const writes = (res.write as Mock).mock.calls.map((c) => c[0] as string);
    // AppError → uses err.code ('AI_SERVICE_ERROR') and err.message
    expect(writes.some((w) => w.includes('AI_SERVICE_ERROR'))).toBe(true);
    expect(writes.some((w) => w.includes('Replicate quota exceeded'))).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws ValidationError for expired session without writing SSE', async () => {
    const expired = makeSession({ expires_at: new Date(Date.now() - 1000).toISOString() });
    mockLoadSession(expired);

    const res = makeMockResponse(); // headersSent = false
    const next = vi.fn();

    await streamResponse(
      { sessionId: SESSION_ID, message: 'Hello', posterContextIds: [], posterSimilarityScores: {} },
      res as unknown as Response,
      next,
    );

    // loadSession throws SessionExpiredError before headers are sent → just call next(err)
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(SessionExpiredError);
    expect(res.write).not.toHaveBeenCalled();
  });

  it('triggers compressHistory when the session token budget is approaching', async () => {
    // Build a session whose history exceeds the token budget so isApproachingBudget returns true.
    // SYSTEM_PROMPT_TOKENS(400) + contextTokens(0) + historyTokens + RESPONSE_BUFFER(900) > 8000
    // → historyTokens must exceed 6700 → need ~26,800+ chars of history content.
    const longContent = 'x'.repeat(27_000);
    const longSession = makeSession({
      messages: Array.from({ length: 6 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: i === 0 ? longContent : `msg ${i}`,
        timestamp: '',
      })),
    });

    mockLoadSession(longSession);
    // No poster context → fetchPosterContext exits early, no Supabase call
    // compressHistory fires: mockMessagesCreate handles the summarization call
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary of earlier conversation.' }],
    });
    mockSaveSession();
    mockMessagesStream.mockReturnValueOnce(makeStreamMock(['Compressed response.']));

    await streamResponse(
      { sessionId: SESSION_ID, message: 'What is this about?', posterContextIds: [], posterSimilarityScores: {} },
      makeMockResponse() as unknown as Response,
      vi.fn(),
    );

    // compressHistory calls messages.create once for summarization
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
    // The main stream call happens after compression
    expect(mockMessagesStream).toHaveBeenCalledOnce();
  });

  it('prepends a synthetic user message when session history starts with an assistant turn', async () => {
    // Covers buildAnthropicMessages: if first stored message is assistant, prepend a placeholder
    const assistantFirstSession = makeSession({
      messages: [
        { role: 'assistant', content: 'Welcome! How can I help?', timestamp: '' },
        { role: 'user', content: 'Tell me about WPA.', timestamp: '' },
      ],
    });

    mockLoadSession(assistantFirstSession);
    mockSaveSession();
    mockMessagesStream.mockReturnValueOnce(makeStreamMock(['Here is what I know.']));

    await streamResponse(
      { sessionId: SESSION_ID, message: 'Any more details?', posterContextIds: [], posterSimilarityScores: {} },
      makeMockResponse() as unknown as Response,
      vi.fn(),
    );

    expect(mockMessagesStream).toHaveBeenCalledOnce();
    const callArgs = mockMessagesStream.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    // First message in the Anthropic call must be 'user' (the prepended placeholder)
    expect(callArgs.messages[0]?.role).toBe('user');
    expect(callArgs.messages[0]?.content).toContain('[Continuing our conversation]');
  });
});
