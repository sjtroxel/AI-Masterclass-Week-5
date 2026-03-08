# Poster Pilot — RAG Strategy

## Overview

Poster Pilot uses a **multimodal retrieval-augmented generation** architecture.
Unlike text-only RAG, our retrieval layer is driven by CLIP embeddings that understand
both visual content and semantic meaning simultaneously. The Archivist LLM (claude-sonnet-4-6)
only receives retrieved metadata — never raw image data — because its role is historical
context, not visual description.

---

## Part 1: Chunking Strategy for Multimodal Data

### The Core Problem
Traditional RAG systems chunk long text documents into overlapping passages.
NARA poster data is structured differently:
- Metadata is sparse and structured (fields, not paragraphs)
- The primary signal is VISUAL (the image)
- Text descriptions are short (typically 20–200 words)
- The "document" is the poster itself — it should not be split

### Our Approach: Poster-as-Atomic-Unit
**Each poster is one retrieval unit.** We do not chunk within a poster's metadata.

Instead, we create a **composite text representation** of each poster for text-based
embedding (used in hybrid search):

```
[TITLE]: Treasury Department Poster — Buy War Bonds
[CREATOR]: Unknown, Federal Art Project
[DATE]: ca. 1942
[SERIES]: WPA Posters
[DESCRIPTION]: A bold graphic image showing an eagle clutching war bonds against
a red and white striped background, encouraging citizens to support the war effort.
[SUBJECTS]: World War II, War Bonds, Patriotism, Federal Art Project, Eagles
[PHYSICAL]: Silkscreen print, 71 x 56 cm
```

This composite is embedded once at ingest and stored alongside the image embedding.

### Why Not Chunk?
- Chunking poster metadata would produce fragments ("silkscreen print, 71 x 56 cm")
  that are meaningless without the poster context.
- Each poster is already the natural unit of meaning in an archival corpus.
- pgvector's ANN (approximate nearest neighbor) search operates efficiently at poster
  granularity even at 100,000+ poster scale (planned IVFFlat index with 100 lists).

### Hybrid Search Strategy
| Search Mode | Embedding Used | Weight |
|------------|----------------|--------|
| `text` | CLIP text embedding of user query | 100% text |
| `image` | CLIP image embedding of uploaded image | 100% visual |
| `hybrid` | Both, combined via Reciprocal Rank Fusion (RRF) | 60% visual, 40% text |
| `vibe` | CLIP text embedding (intent/aesthetic query) | 100% text with expanded synonyms |

**Vibe search** ("1950s Googie aesthetic", "melancholy wartime blue") uses query expansion:
Claude first rewrites the vibe query into 3–5 concrete descriptive phrases, each is
embedded separately, and the results are merged by RRF. This is the "intent-based" search mode.

### Vibe Query Expansion Prompt
```
You are a visual search assistant. The user wants to find NARA posters matching a
visual or aesthetic concept. Rewrite their query into 3-5 concrete, literal visual
descriptions that a visual search model could match to images.

User vibe query: "{user_query}"

Return a JSON array of strings. Example for "wartime optimism":
["soldiers returning home to cheering crowds", "bright colors victory celebration",
"workers building ships with smiles", "children waving flags at parade",
"bold red white blue patriotic imagery"]

Only return the JSON array. No explanation.
```

---

## Part 2: The Archivist — System Prompts & Behavior

### Role Definition
The Archivist is a knowledgeable but disciplined historical research assistant.
It speaks with authority about what the NARA metadata confirms, and with explicit
humility about what it cannot confirm.

### System Prompt (Production)
```
You are The Archivist, an expert research assistant for the National Archives poster
corpus at Poster Pilot. You help users understand the historical context, artistic
significance, and provenance of posters in the NARA collection.

STRICT RULES:
1. You only discuss topics directly supported by the poster metadata provided in
   <context>. Do not introduce historical facts from your training data without
   flagging them as background knowledge (not archival fact).
2. When citing a fact, reference the specific NARA field: e.g.,
   "According to the NARA catalog record, the creator is listed as 'Federal Art Project'."
3. If the context does not contain enough information to answer confidently, say:
   "The NARA record for this poster doesn't provide details on that. A human archivist
   at nara-reference@archives.gov can provide more precise assistance."
4. You do not speculate about what a poster "might" mean artistically unless the
   description field explicitly addresses it.
5. If asked about posters not in the current context, say you don't have those records
   available and suggest the user search for them.
6. Keep responses concise — 2–4 paragraphs maximum unless the user asks for more detail.
7. Never fabricate NARA record numbers, creator names, dates, or descriptions.

Your tone is scholarly but accessible — like a knowledgeable museum docent,
not an academic paper.

<context>
{RETRIEVED_POSTER_CONTEXTS}
</context>
```

### Context Block Template (Per Poster)
Each retrieved poster contributes one context block — max 5 posters per request:

```xml
<poster nara_id="{nara_id}" similarity_score="{score:.3f}">
  <title>{title}</title>
  <creator>{creator}</creator>
  <date>{date_created}</date>
  <series>{series_title}</series>
  <description>{description}</description>
  <subjects>{subject_tags joined by ", "}</subjects>
  <physical>{physical_description}</physical>
  <confidence>{overall_confidence:.2f}</confidence>
</poster>
```

### Confidence Self-Assessment Prompt (appended when similarity < 0.72)
When the retrieval confidence is low, this clause is added to the system prompt:

```
IMPORTANT: The similarity scores for the retrieved posters are below the confidence
threshold (scores shown in each <poster> tag). This means the search results may not
closely match the user's query. Be transparent about this uncertainty. If appropriate,
say: "I should note that I'm not fully confident these results match your query. Our
system suggests connecting with a human NARA archivist for more precise assistance."
```

---

## Part 3: Retrieval Pipeline Details

### Step 1: Query Understanding
```
User query → queryAnalyzer.ts
  ├── Classify mode: text / image / vibe
  ├── If vibe: expand to 3-5 concrete descriptions (Claude call)
  ├── Detect series intent: "WPA posters of..." → add series filter
  └── Detect date intent: "1940s posters..." → add date filter
```

### Step 2: Embedding Generation
```
Preprocessed query → CLIP model
  ├── Truncate to 77 tokens (CLIP limit) — log if truncated
  ├── Normalize text (lowercase, strip special chars)
  └── Return float4[768] — validate shape before DB call
```

### Step 3: Vector Retrieval
```
Supabase RPC: match_posters(embedding, threshold=0.72, count=20)
  ├── IVFFlat ANN search (approximate — acceptable for this use case)
  ├── Optional series_filter (exact match on series.slug)
  └── Returns: id, title, thumbnail_url, similarity_score, overall_confidence
```

### Step 4: Result Augmentation
```
Result IDs → posters table SELECT (no embedding column)
  ├── Fetch: description, creator, date_created, subject_tags, physical_description
  ├── Sort: primary by similarity_score DESC, secondary by overall_confidence DESC
  └── Flag: handoff_needed = any(similarity_score) < 0.72
```

### Step 5: Response Assembly
```
Augmented results → searchService.ts
  ├── PosterResult[] (typed, see shared/types.ts)
  ├── handoff_needed: boolean
  ├── handoff_reason: string | null
  └── Log to poster_search_events (async, non-blocking)
```

---

## Part 4: Token Budget Management

The Archivist conversation must stay under 8,000 tokens (conservatively, to allow
for response generation within the model's context window).

### Budget Allocation
| Component | Estimated Tokens | Notes |
|-----------|-----------------|-------|
| System prompt | ~400 | Fixed |
| Context (5 posters) | ~1,500 | ~300 tokens per poster |
| Conversation history | Up to 5,000 | Sliding window |
| User message | ~200 | Current turn |
| Response buffer | ~900 | claude-sonnet-4-6 max_tokens=900 |
| **Total** | **~8,000** | |

### Truncation Strategy
When conversation history exceeds the budget:
1. Summarize the oldest 4 message pairs into a single `[EARLIER CONTEXT SUMMARIZED]` message
   (one additional Claude call with a summarization prompt)
2. Preserve the 2 most recent message pairs verbatim for conversational continuity
3. Never truncate the context block or system prompt

### Summarization Prompt (for history compression)
```
Summarize the following conversation in 2-3 sentences, preserving any specific
poster IDs, NARA record numbers, or historical facts that were established.
Conversation to summarize:
{old_messages}
```

---

## Part 5: Anti-Hallucination Safeguards

| Risk | Safeguard |
|------|-----------|
| Archivist invents a date | System prompt: "Do not state dates not in the provided context" |
| Archivist confuses two posters | Context blocks are XML-tagged with `nara_id`; prompt references them explicitly |
| Low similarity returns bad results | `similarity_score < 0.72` → handoff flag + Red Button |
| Vibe expansion goes off-topic | Vibe expansion prompt is tightly constrained; output is validated as JSON array |
| User asks about out-of-corpus posters | System prompt: "Only discuss posters in `<context>`" |
| Citation is wrong | Each citation includes the field name and value — traceable to source |

---

## Part 6: Future Enhancements (Post-MVP)

- **Feedback loop**: Thumbs up/down on Archivist responses feeds into a fine-tuning dataset.
- **Cross-series discovery**: "Show me posters from any series with this visual motif" —
  requires cross-series centroid comparison.
- **Temporal similarity**: Cluster posters by `date_normalized` to enable
  "other posters from this era" recommendations.
- **DPLA / NARA live sync**: Replace batch ingest with incremental updates triggered
  by DPLA's feed or, if the NARA Catalog API is restored, direct webhook-driven sync
  when NARA adds new digitized items.
