# AI Feature Rules — CLIP, RAG, The Archivist

These rules apply when working in `server/services/clipService.ts`,
`server/services/archivistService.ts`, and any embedding/retrieval code.

## CLIP Embedding Rules
- Model: `openai/clip-vit-large-patch14` (768-dimension vectors)
- Embeddings are generated ONCE at ingest time and stored in `posters.embedding`.
- At query time, only the QUERY is embedded — stored embeddings are never regenerated.
- Text queries are preprocessed before embedding: lowercase, strip punctuation, max 77 tokens
  (CLIP's limit). Truncation is logged as a warning.
- Image queries accept URLs or base64 data URIs — the service normalizes to base64 internally.

## The Archivist — System Prompt Rules
The Archivist is a grounded RAG chatbot. Its behavior is governed by these non-negotiable rules:

1. **Groundedness**: Every factual claim must reference a specific field from the retrieved
   NARA metadata. The system prompt must instruct the model to cite sources explicitly.
2. **Scope boundary**: The Archivist only discusses the posters and historical context
   directly relevant to the current user's query and the retrieved context.
   It must NOT speculate beyond what the metadata supports.
3. **Handoff acknowledgment**: If `similarity_score < 0.72`, the Archivist must proactively
   say: "I'm not fully confident in these results. A human archivist can provide more precise
   assistance." — then surface The Red Button.
4. **No hallucination guardrail**: The system prompt explicitly instructs: "If the provided
   context does not contain enough information to answer the question, say so directly.
   Do not invent historical facts, dates, creators, or descriptions."

## Context Window Management for RAG
- Maximum retrieved posters per Archivist query: 5 (to stay within context limits)
- Each poster's context block is limited to: title, date_created, creator, description,
  subject_tags, nara_id, series_title — NOT the raw embedding vector.
- The system prompt + context + conversation history must stay under 8,000 tokens.
  If it approaches this limit, truncate conversation history (oldest messages first),
  never truncate the context blocks.

## Confidence Score Thresholds
| Score Range | Action |
|-------------|--------|
| ≥ 0.85 | High confidence — show results normally |
| 0.72 – 0.84 | Medium confidence — show results with a subtle indicator |
| < 0.72 | Low confidence — trigger Human Handoff (Red Button) |

## Anti-Patterns
- Never call the Anthropic API from a React component — route through Express.
- Never store raw conversation messages in `localStorage` — session state goes in
  `archivist_sessions` on Supabase (with a session TTL of 24 hours).
- Never embed the same text twice with different preprocessing — preprocessing must be
  idempotent and centralized in `server/lib/clipPreprocessor.ts`.
- Never use `temperature > 0.3` for The Archivist — it must be deterministic and grounded.
