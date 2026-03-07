// ─── Confidence Thresholds ────────────────────────────────────────────────────

/** Minimum similarity score before Human Handoff (The Red Button) is triggered. */
export const HUMAN_HANDOFF_THRESHOLD = 0.72;

/** Similarity score at or above which results are shown without any qualifier. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.85;

// ─── CLIP ─────────────────────────────────────────────────────────────────────

export const CLIP_EMBEDDING_DIMENSIONS = 768;
export const CLIP_MODEL_ID = 'openai/clip-vit-large-patch14';

// ─── RAG / Context Window ─────────────────────────────────────────────────────

/** Maximum number of posters retrieved per Archivist query. */
export const MAX_RAG_CONTEXT_POSTERS = 5;

/**
 * Hard token budget for system prompt + context blocks + conversation history.
 * If the total approaches this limit, oldest conversation messages are truncated first.
 */
export const MAX_CONTEXT_TOKENS = 8000;

// ─── The Archivist (LLM generation) ──────────────────────────────────────────

/** max_tokens passed to the Anthropic API for each Archivist response. */
export const ARCHIVIST_MAX_TOKENS = 900;

/** temperature passed to the Anthropic API. Must stay low for grounded responses. */
export const ARCHIVIST_TEMPERATURE = 0.2;
