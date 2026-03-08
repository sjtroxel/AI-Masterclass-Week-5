import type { Poster } from '@poster-pilot/shared';

// CLIP's text encoder has a hard limit of 77 BPE tokens.
// We approximate token count by whitespace-splitting, which is idiomatic for
// short archival metadata strings and keeps this module free of heavy ML deps.
const CLIP_TOKEN_LIMIT = 77;

/**
 * Preprocesses a text string for CLIP text embedding.
 *
 * Steps (in order):
 *   1. Lowercase
 *   2. Replace punctuation with spaces (preserves word boundaries)
 *   3. Collapse whitespace
 *   4. Truncate to 77 whitespace-delimited tokens; log a warning if truncated
 *
 * This function is idempotent: `preprocessText(preprocessText(x)) === preprocessText(x)`.
 */
export function preprocessText(text: string): string {
  if (text.length === 0) return '';

  // 1. Lowercase
  const lower = text.toLowerCase();

  // 2. Replace punctuation with a space so word boundaries are preserved.
  //    \w matches [a-z0-9_] (after lowercasing); everything else is punctuation.
  const stripped = lower.replace(/[^\w\s]/g, ' ');

  // 3. Normalize whitespace and split into tokens
  const tokens = stripped.trim().split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length === 0) return '';

  // 4. Truncate at CLIP's limit
  if (tokens.length > CLIP_TOKEN_LIMIT) {
    // eslint-disable-next-line no-console
    console.warn(
      `[clipPreprocessor] Text truncated from ${tokens.length} to ${CLIP_TOKEN_LIMIT} tokens`,
    );
    return tokens.slice(0, CLIP_TOKEN_LIMIT).join(' ');
  }

  return tokens.join(' ');
}

/**
 * Assembles a composite text representation of a poster for CLIP text embedding.
 *
 * Format (from RAG_STRATEGY.md):
 *   [TITLE]: ...
 *   [CREATOR]: ...
 *   [DATE]: ...
 *   [SERIES]: ...
 *   [DESCRIPTION]: ...
 *   [SUBJECTS]: ...
 *   [PHYSICAL]: ...
 *
 * Null, undefined, and empty-array fields are silently omitted — no placeholder text.
 * Field order is fixed per the spec.
 */
export function buildCompositeText(poster: Partial<Poster>): string {
  const parts: string[] = [];

  if (poster.title) {
    parts.push(`[TITLE]: ${poster.title}`);
  }
  if (poster.creator) {
    parts.push(`[CREATOR]: ${poster.creator}`);
  }
  if (poster.date_created) {
    parts.push(`[DATE]: ${poster.date_created}`);
  }
  if (poster.series_title) {
    parts.push(`[SERIES]: ${poster.series_title}`);
  }
  if (poster.description) {
    parts.push(`[DESCRIPTION]: ${poster.description}`);
  }
  if (poster.subject_tags && poster.subject_tags.length > 0) {
    parts.push(`[SUBJECTS]: ${poster.subject_tags.join(', ')}`);
  }
  if (poster.physical_description) {
    parts.push(`[PHYSICAL]: ${poster.physical_description}`);
  }

  return parts.join('\n');
}
