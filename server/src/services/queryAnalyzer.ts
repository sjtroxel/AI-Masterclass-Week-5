import Anthropic from '@anthropic-ai/sdk';
import { config } from '../lib/config.js';
import { AIServiceError } from '../middleware/errorHandler.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIBE_EXPANSION_MODEL = 'claude-haiku-4-5-20251001';
const VIBE_EXPANSION_TEMPERATURE = 0.3;
const VIBE_EXPANSION_MAX_TOKENS = 256;
const MIN_VIBE_EXPANSIONS = 3;
const MAX_VIBE_EXPANSIONS = 5;

/**
 * Words/phrases that signal aesthetic or mood intent → vibe mode.
 * Vibe mode triggers Claude query expansion before CLIP embedding.
 */
const VIBE_KEYWORDS = [
  'vibe',
  'aesthetic',
  'mood',
  'feel',
  'style',
  'era',
  'art deco',
  'bauhaus',
  'googie',
  'retro',
  'nostalgic',
  'melancholy',
  'somber',
  'optimistic',
  'reminiscent',
  'evocative',
] as const;

/**
 * Maps series slugs to text signals that indicate a user intends a specific series.
 * Used to populate seriesIntent on QueryAnalysis when no explicit series_filter is given.
 */
const SERIES_INTENT_SIGNALS: Record<string, readonly string[]> = {
  'wpa-posters': ['wpa', 'work progress administration', 'federal art project', 'new deal'],
  'nasa-history': ['nasa', 'space', 'apollo', 'shuttle', 'moon landing', 'astronaut'],
  'patent-medicine': [
    'patent medicine',
    'remedy',
    'elixir',
    'tonic',
    'nostrum',
    'cure-all',
    'snake oil',
  ],
  'wwii-propaganda': [
    'wwii',
    'world war ii',
    'world war 2',
    'war effort',
    'propaganda',
    'axis',
    'allies',
  ],
};

/** Matches decade strings like "1940s", "1890s". */
const DECADE_PATTERN = /\b(1[89]\d0s|20[012]0s)\b/i;

/** Matches year ranges like "1941-1945", "1941–1945", "1941 to 1945". */
const YEAR_RANGE_PATTERN = /\b(1[89]\d\d)\s*[-–to]+\s*(1[89]\d\d|20\d\d)\b/i;

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueryAnalysis = {
  /** 'vibe' if the query contains aesthetic/mood language; 'text' otherwise. */
  mode: 'text' | 'vibe';
  /** Series slug if text signals imply a specific series, otherwise null. */
  seriesIntent: string | null;
  /** Decade or year range if detected (e.g. "1940s", "1941-1945"), otherwise null. */
  dateIntent: string | null;
  /** Lowercased and trimmed query — ready for downstream preprocessing. */
  processedQuery: string;
};

// ─── Anthropic client (lazy singleton) ───────────────────────────────────────

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return _anthropicClient;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Classifies a text query by mode, series intent, and date intent.
 *
 * - mode: 'vibe' if aesthetic/mood keywords are present; 'text' otherwise.
 * - seriesIntent: the slug of the matching series if keywords match, else null.
 *   Used by the route to supplement an absent explicit series_filter.
 * - dateIntent: a decade ("1940s") or year range ("1941–1945") if found, else null.
 * - processedQuery: lowercased and trimmed — suitable for CLIP preprocessing.
 *
 * This function is synchronous and has no external dependencies.
 */
export function analyzeQuery(query: string): QueryAnalysis {
  const processedQuery = query.trim().toLowerCase();

  const mode: 'text' | 'vibe' = VIBE_KEYWORDS.some((kw) => processedQuery.includes(kw))
    ? 'vibe'
    : 'text';

  let seriesIntent: string | null = null;
  for (const [slug, signals] of Object.entries(SERIES_INTENT_SIGNALS)) {
    if (signals.some((s) => processedQuery.includes(s))) {
      seriesIntent = slug;
      break;
    }
  }

  let dateIntent: string | null = null;
  const decadeMatch = DECADE_PATTERN.exec(query);
  const rangeMatch = YEAR_RANGE_PATTERN.exec(query);
  if (decadeMatch?.[0]) {
    dateIntent = decadeMatch[0];
  } else if (rangeMatch?.[0]) {
    dateIntent = rangeMatch[0];
  }

  return { mode, seriesIntent, dateIntent, processedQuery };
}

/**
 * Expands an aesthetic/mood vibe query into 3–5 concrete visual descriptions
 * that CLIP can match to images.
 *
 * Uses the prompt from RAG_STRATEGY.md. Throws AIServiceError if:
 * - The model call fails
 * - The response is not valid JSON
 * - The parsed array is outside the [3, 5] count range or contains non-strings
 */
export async function expandVibeQuery(query: string): Promise<string[]> {
  const client = getAnthropicClient();

  const prompt =
    `You are a visual search assistant. The user wants to find historical posters matching a ` +
    `visual or aesthetic concept. Rewrite their query into ${MIN_VIBE_EXPANSIONS}–${MAX_VIBE_EXPANSIONS} ` +
    `concrete, literal visual descriptions that a visual search model could match to images.\n\n` +
    `User vibe query: "${query}"\n\n` +
    `Return a JSON array of strings. Example for "wartime optimism":\n` +
    `["soldiers returning home to cheering crowds", "bright colors victory celebration", ` +
    `"workers building ships with smiles", "children waving flags at parade", ` +
    `"bold red white blue patriotic imagery"]\n\n` +
    `Only return the JSON array. No explanation.`;

  let rawText: string;

  try {
    const response = await client.messages.create({
      model: VIBE_EXPANSION_MODEL,
      max_tokens: VIBE_EXPANSION_MAX_TOKENS,
      temperature: VIBE_EXPANSION_TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new AIServiceError('Vibe expansion: unexpected response structure from model');
    }
    rawText = block.text.trim();
  } catch (err) {
    if (err instanceof AIServiceError) throw err;
    throw new AIServiceError(
      `Vibe expansion model call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    // Strip markdown code fences in case the model wraps its output
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(jsonText);
  } catch {
    throw new AIServiceError(
      `Vibe expansion returned invalid JSON. Raw output: "${rawText.slice(0, 200)}"`,
    );
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length < MIN_VIBE_EXPANSIONS ||
    parsed.length > MAX_VIBE_EXPANSIONS ||
    !parsed.every((item): item is string => typeof item === 'string' && item.length > 0)
  ) {
    const detail = Array.isArray(parsed)
      ? `${parsed.length} items`
      : `unexpected type: ${typeof parsed}`;
    throw new AIServiceError(
      `Vibe expansion returned an invalid array (expected ${MIN_VIBE_EXPANSIONS}–${MAX_VIBE_EXPANSIONS} ` +
        `non-empty strings, got ${detail})`,
    );
  }

  return parsed;
}
