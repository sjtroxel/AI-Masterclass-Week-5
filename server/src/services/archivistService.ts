import Anthropic from '@anthropic-ai/sdk';
import type { Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import {
  AppError,
  AIServiceError,
  DatabaseError,
  SessionExpiredError,
} from '../middleware/errorHandler.js';
import type { Citation, ChatMessage, ArchivistSession } from '@poster-pilot/shared';

// ─── Client ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.2;
const MAX_TOKENS = 900;
const HANDOFF_THRESHOLD = 0.72;
const MAX_CONTEXT_POSTERS = 20;
const TOKEN_BUDGET = 20000;
const SYSTEM_PROMPT_TOKENS = 400; // estimated fixed overhead
const RESPONSE_BUFFER_TOKENS = 900;
const TOKENS_PER_POSTER = 300;   // estimated tokens per context block poster
const MESSAGES_TO_PRESERVE = 4;  // 2 most recent user/assistant pairs

// ─── Prompts (verbatim from RAG_STRATEGY.md) ─────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are The Archivist, an expert research assistant for the National Archives poster corpus at Poster Pilot. You help users understand the historical context, artistic significance, and provenance of posters in the NARA collection.

STRICT RULES:
1. You only discuss topics directly supported by the poster metadata provided in <context>. Do not introduce historical facts from your training data without flagging them as background knowledge (not archival fact).
2. When citing a fact, reference the specific NARA field: e.g., "According to the NARA catalog record, the creator is listed as 'Federal Art Project'."
3. If the context does not contain enough information to answer confidently, say: "The NARA record for this poster doesn't provide details on that. A human archivist at nara-reference@archives.gov can provide more precise assistance."
4. You do not speculate about what a poster "might" mean artistically unless the description field explicitly addresses it.
5. If asked about posters not in the current context, say you don't have those records available and suggest the user search for them.
6. Keep responses concise — 2–4 paragraphs maximum unless the user asks for more detail.
7. Never fabricate NARA record numbers, creator names, dates, or descriptions.

Your tone is scholarly but accessible — like a knowledgeable museum docent, not an academic paper.

<context>
{CONTEXT_BLOCK}
</context>`;

const LOW_CONFIDENCE_CLAUSE = `

IMPORTANT: The similarity scores for the retrieved posters are below the confidence threshold (scores shown in each <poster> tag). This means the search results may not closely match the user's query. Be transparent about this uncertainty. If appropriate, say: "I should note that I'm not fully confident these results match your query. Our system suggests connecting with a human NARA archivist for more precise assistance."`;

const SUMMARIZATION_PROMPT = (oldMessages: string): string =>
  `Summarize the following conversation in 2-3 sentences, preserving any specific poster IDs, NARA record numbers, or historical facts that were established.\nConversation to summarize:\n${oldMessages}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArchivistParams = {
  sessionId: string;
  message: string;
  posterContextIds: string[];
  posterSimilarityScores: Record<string, number>;
};

type PosterContextRow = {
  id: string;
  nara_id: string;
  title: string | null;
  creator: string | null;
  date_created: string | null;
  series_title: string | null;
  description: string | null;
  subject_tags: string[] | null;
  physical_description: string | null;
  overall_confidence: number;
};

type PosterContextData = {
  block: string;
  naraIds: string[];
};

// ─── 5.1 — Context assembly ───────────────────────────────────────────────────

/** Fetches poster rows and builds the XML context block + returns nara_ids for citation extraction. */
async function fetchPosterContext(
  posterIds: string[],
  similarityScores: Record<string, number>,
): Promise<PosterContextData> {
  const ids = posterIds.slice(0, MAX_CONTEXT_POSTERS);
  if (ids.length === 0) return { block: '', naraIds: [] };

  const { data, error } = await supabase
    .from('posters')
    .select(
      'id, nara_id, title, creator, date_created, series_title, description, subject_tags, physical_description, overall_confidence',
    )
    .in('id', ids);

  if (error) throw new DatabaseError(`Failed to fetch poster context: ${error.message}`);
  if (!data || data.length === 0) return { block: '', naraIds: [] };

  const rows = data as PosterContextRow[];
  const naraIds = rows.map((r) => r.nara_id);

  const block = rows
    .map((poster) => {
      const score = similarityScores[poster.id] ?? 0;
      const subjects = Array.isArray(poster.subject_tags)
        ? poster.subject_tags.join(', ')
        : '';
      return (
        `<poster nara_id="${poster.nara_id}" similarity_score="${score.toFixed(3)}">\n` +
        `  <title>${poster.title ?? ''}</title>\n` +
        `  <creator>${poster.creator ?? 'Unknown'}</creator>\n` +
        `  <date>${poster.date_created ?? 'Unknown'}</date>\n` +
        `  <series>${poster.series_title ?? ''}</series>\n` +
        `  <description>${poster.description ?? ''}</description>\n` +
        `  <subjects>${subjects}</subjects>\n` +
        `  <physical>${poster.physical_description ?? ''}</physical>\n` +
        `  <confidence>${poster.overall_confidence.toFixed(2)}</confidence>\n` +
        `</poster>`
      );
    })
    .join('\n');

  return { block, naraIds };
}

/**
 * Builds the XML context block for the given poster IDs.
 * Exported per spec (5.1) — signature includes optional similarity scores because
 * the XML template requires them for the handoff threshold display.
 */
export async function buildContextBlock(
  posterIds: string[],
  similarityScores: Record<string, number> = {},
): Promise<string> {
  const { block } = await fetchPosterContext(posterIds, similarityScores);
  return block;
}

/** Injects the context block into the production system prompt. Appends the confidence
 *  clause when any retrieved poster has similarity_score < 0.72. */
export function assembleSystemPrompt(contextBlock: string, lowConfidence: boolean): string {
  const prompt = BASE_SYSTEM_PROMPT.replace('{CONTEXT_BLOCK}', contextBlock);
  return lowConfidence ? prompt + LOW_CONFIDENCE_CLAUSE : prompt;
}

// ─── 5.2 — Session management ─────────────────────────────────────────────────

function emptySession(sessionId: string): ArchivistSession {
  const now = new Date().toISOString();
  return {
    id: '',
    session_id: sessionId,
    messages: [],
    poster_context: [],
    turn_count: 0,
    total_tokens: 0,
    archivist_expressed_uncertainty: false,
    handoff_prompted_at: null,
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** Loads the session from Supabase. Returns a fresh empty session if not found.
 *  Throws ValidationError if the session exists but has expired. */
export async function loadSession(sessionId: string): Promise<ArchivistSession> {
  const { data, error } = await supabase
    .from('archivist_sessions')
    .select(
      'id, session_id, messages, poster_context, turn_count, total_tokens, archivist_expressed_uncertainty, handoff_prompted_at, created_at, updated_at, expires_at',
    )
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw new DatabaseError(`Failed to load archivist session: ${error.message}`);
  if (!data) return emptySession(sessionId);

  if (new Date((data as ArchivistSession).expires_at) < new Date()) {
    throw new SessionExpiredError();
  }

  return data as ArchivistSession;
}

/** Upserts the session to Supabase, updating audit fields. */
export async function saveSession(session: ArchivistSession): Promise<void> {
  const { error } = await supabase.from('archivist_sessions').upsert(
    {
      session_id: session.session_id,
      messages: session.messages,
      poster_context: session.poster_context,
      turn_count: session.turn_count,
      total_tokens: session.total_tokens,
      archivist_expressed_uncertainty: session.archivist_expressed_uncertainty,
      handoff_prompted_at: session.handoff_prompted_at,
      updated_at: new Date().toISOString(),
      expires_at: session.expires_at,
    },
    { onConflict: 'session_id' },
  );

  if (error) throw new DatabaseError(`Failed to save archivist session: ${error.message}`);
}

// ─── 5.3 — Token budget management ───────────────────────────────────────────

/** Rough token count estimate: 1 token ≈ 4 characters. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Returns true when estimated total prompt tokens approach the 8,000-token budget. */
export function isApproachingBudget(
  session: ArchivistSession,
  contextTokens: number,
): boolean {
  const historyTokens = session.messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0,
  );
  const total = SYSTEM_PROMPT_TOKENS + contextTokens + historyTokens + RESPONSE_BUFFER_TOKENS;
  return total > TOKEN_BUDGET;
}

/**
 * Compresses the oldest messages via a Claude summarization call.
 * Preserves the 2 most recent user/assistant pairs verbatim.
 */
export async function compressHistory(session: ArchivistSession): Promise<ArchivistSession> {
  if (session.messages.length <= MESSAGES_TO_PRESERVE) return session;

  const toCompress = session.messages.slice(0, -MESSAGES_TO_PRESERVE);
  const toPreserve = session.messages.slice(-MESSAGES_TO_PRESERVE);

  const formattedHistory = toCompress
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const summaryResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: TEMPERATURE,
    messages: [{ role: 'user', content: SUMMARIZATION_PROMPT(formattedHistory) }],
  });

  const first = summaryResponse.content[0];
  if (!first || first.type !== 'text') {
    throw new AIServiceError('Unexpected response format from history compression call');
  }

  const summaryMessage: ChatMessage = {
    role: 'user',
    content: `[EARLIER CONTEXT SUMMARIZED]\n${first.text}`,
    timestamp: new Date().toISOString(),
  };

  return { ...session, messages: [summaryMessage, ...toPreserve] };
}

// ─── 5.6 — Citation extraction ────────────────────────────────────────────────

/**
 * Scans the assistant's response text for any nara_id values from the retrieved
 * poster context. Each mention becomes a citation. Duplicates are filtered.
 */
export function extractCitations(text: string, posterNaraIds: string[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const naraId of posterNaraIds) {
    if (text.includes(naraId) && !seen.has(naraId)) {
      seen.add(naraId);
      citations.push({ nara_id: naraId, field: 'nara_id', value: naraId });
    }
  }

  return citations;
}

// ─── Anthropic message builder ────────────────────────────────────────────────

/**
 * Normalizes session history into a valid Anthropic messages array.
 * The API requires alternating user/assistant messages starting with 'user'.
 * After history compression the first stored message may be a summary (role: 'user'),
 * which is fine. However, if somehow the first is 'assistant', a synthetic user
 * placeholder is prepended to satisfy the API contract.
 */
function buildAnthropicMessages(
  history: ChatMessage[],
  currentUserMessage: string,
): Anthropic.MessageParam[] {
  const params: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Anthropic requires the first message to have role 'user'.
  if (params.length > 0 && params[0]?.role === 'assistant') {
    params.unshift({ role: 'user', content: '[Continuing our conversation]' });
  }

  params.push({ role: 'user', content: currentUserMessage });
  return params;
}

// ─── 5.4 — Streaming Anthropic call ──────────────────────────────────────────

/**
 * Orchestrates the full Archivist response pipeline:
 * session load → context assembly → budget check → stream → save session → final SSE event.
 *
 * All SSE writes go directly to `res`. On error after headers are sent, an SSE error
 * event is emitted before calling `next(err)` for server-side logging.
 */
export async function streamResponse(
  params: ArchivistParams,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // 1. Load session (throws ValidationError if expired)
    let session = await loadSession(params.sessionId);

    // 2. Build context block + collect nara_ids for citation extraction
    const { block: contextBlock, naraIds: posterNaraIds } = await fetchPosterContext(
      params.posterContextIds,
      params.posterSimilarityScores,
    );

    // 3. Compress history if approaching token budget
    const contextTokens = params.posterContextIds.length * TOKENS_PER_POSTER;
    if (isApproachingBudget(session, contextTokens)) {
      session = await compressHistory(session);
    }

    // 4. Assemble system prompt (with optional confidence clause)
    const lowConfidence = Object.values(params.posterSimilarityScores).some(
      (score) => score < HANDOFF_THRESHOLD,
    );
    const systemPrompt = assembleSystemPrompt(contextBlock, lowConfidence);
    const messages = buildAnthropicMessages(session.messages, params.message);

    // 5. Stream from Anthropic
    let fullText = '';
    const stream = anthropic.messages.stream({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
    });

    const finalMsg = await stream.finalMessage();
    const tokensUsed =
      (finalMsg.usage.input_tokens ?? 0) + (finalMsg.usage.output_tokens ?? 0);

    // 6. Extract citations and persist session
    const citations = extractCitations(fullText, posterNaraIds);
    const now = new Date().toISOString();

    // Compute confidence from the actual average similarity score of the poster
    // context. This gives a real, query-varying number instead of a binary 0.6/0.85.
    // Falls back to 0 when no scores are available (e.g. detail-page context).
    const scoreValues = Object.values(params.posterSimilarityScores);
    const confidence =
      scoreValues.length > 0
        ? scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length
        : (lowConfidence ? 0.6 : 0.85);

    const userMsg: ChatMessage = { role: 'user', content: params.message, timestamp: now };
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: fullText,
      citations,
      timestamp: now,
      confidence,
      handoff_suggested: lowConfidence,
    };

    const updatedSession: ArchivistSession = {
      ...session,
      messages: [...session.messages, userMsg, assistantMsg],
      poster_context: params.posterContextIds,
      turn_count: session.turn_count + 1,
      total_tokens: session.total_tokens + tokensUsed,
      archivist_expressed_uncertainty:
        session.archivist_expressed_uncertainty || lowConfidence,
    };

    await saveSession(updatedSession);

    // 7. Final SSE event
    res.write(`data: ${JSON.stringify({ done: true, citations, confidence })}\n\n`);
    res.end();
  } catch (err) {
    // If headers were already sent (mid-stream error), emit an SSE error event
    // before handing off to the global error handler for server-side logging.
    // Include the error code so the client can distinguish SESSION_EXPIRED from
    // other failures and silently recover (spec 9.6).
    if (res.headersSent) {
      const code = err instanceof AppError ? err.code : 'STREAM_ERROR';
      const message = err instanceof AppError ? err.message : 'Stream interrupted unexpectedly';
      res.write(`data: ${JSON.stringify({ error: message, code })}\n\n`);
      res.end();
    }
    next(err);
  }
}
