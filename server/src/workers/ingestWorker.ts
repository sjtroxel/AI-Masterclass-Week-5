/**
 * Ingest Worker — Phase 3.5
 *
 * Entry point: tsx server/src/workers/ingestWorker.ts [flags]
 *
 * Fetches poster records from the DPLA (Digital Public Library of America) API,
 * generates CLIP image embeddings via Replicate, and upserts rows into the
 * Supabase `posters` table.
 *
 * The primary data source was migrated from NARA Catalog API v2 to DPLA because
 * the NARA API backend is currently unreachable (CloudFront serves SPA HTML for
 * all /api/v2/ paths). DPLA aggregates NARA's digital collections alongside
 * holdings from the Library of Congress, Smithsonian, and other institutions,
 * providing equal or broader coverage of the same poster corpus.
 *
 * CLI flags:
 *   --series=<slug>        Series slug to ingest (default: wpa-posters)
 *   --limit=<n>            Cap total posters processed — useful for test runs
 *   --dpla-query=<terms>   Override the default DPLA search query for this series
 *   --fixture=<path>       Load a DPLA-format JSON fixture instead of calling the API
 *   --random-embeddings    Bypass Replicate with random 768-dim unit vectors (DEV ONLY)
 *
 * Examples:
 *   npm run ingest -- --series=wpa-posters --limit=10
 *   npm run ingest -- --series=nasa-history --limit=5 --random-embeddings
 *   npm run ingest -- --fixture=server/src/workers/__fixtures__/dpla-wpa-sample.json --random-embeddings
 */

import { readFileSync } from 'fs';
import { config } from '../lib/config.js';
import { supabase } from '../lib/supabase.js';
import { generateImageEmbedding } from '../services/clipService.js';
import { upsertPoster, updateSeriesCentroid } from '../services/posterService.js';
import { cosineSimilarity } from '../lib/vectorMath.js';
import type { IngestPosterData } from '@poster-pilot/shared';

// ─── DPLA API types ───────────────────────────────────────────────────────────
//
// DPLA returns JSON-LD records. Field paths verified against the DPLA Codex:
//   https://dp.la/info/developers/codex/
//
// Key paths used:
//   doc.id                              → DPLA item ID (unique hash)
//   doc.object                          → thumbnail image URL
//   doc.hasView[0]["@id"]               → full-resolution image URL
//   doc.isShownAt                       → link to item at source institution
//   doc.dataProvider                    → contributing institution name
//   doc.provider.name                   → DPLA provider/aggregator name
//   doc.sourceResource.title            → title (string or string[])
//   doc.sourceResource.description      → description (string or string[])
//   doc.sourceResource.creator          → creator (string or string[])
//   doc.sourceResource.date.displayDate → human-readable date
//   doc.sourceResource.date.begin       → start date (ISO-ish)
//   doc.sourceResource.subject[].name   → subject tags
//   doc.sourceResource.format           → format/medium description
//   doc.sourceResource.rights           → rights statement
//   doc.sourceResource.identifier       → array of identifiers (may include NARA NAIDs)

export type DplaDateField =
  | { begin?: string; end?: string; displayDate?: string }
  | Array<{ begin?: string; end?: string; displayDate?: string }>;

export type DplaSourceResource = {
  title?: string | string[];
  description?: string | string[];
  creator?: string | string[];
  date?: DplaDateField;
  subject?: Array<{ name?: string }>;
  format?: string | string[];
  rights?: string | string[];
  identifier?: string | string[];
  type?: string | string[];
};

export type DplaItem = {
  id: string;
  '@id'?: string;
  isShownAt?: string;
  dataProvider?: string | string[];
  provider?: { '@id'?: string; name?: string };
  object?: string;
  hasView?: Array<{ '@id'?: string; format?: string }>;
  sourceResource: DplaSourceResource;
};

type DplaApiResponse = {
  count: number;
  start: number;
  limit: number;
  docs: DplaItem[];
};

type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  nara_series_ref: string | null;
  centroid: number[] | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DPLA_API_BASE = 'https://api.dp.la/v2/items';
const DPLA_PAGE_SIZE = 100; // DPLA maximum per request
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const DEFAULT_SERIES_SLUG = 'wpa-posters';

/**
 * Default DPLA search queries keyed by series slug.
 * Override any of these with the --dpla-query CLI flag.
 *
 * Queries are intentionally broad to capture the full range of posters
 * that were previously accessible via the NARA Catalog API, plus additional
 * items from non-NARA institutions (Library of Congress, Smithsonian, etc.)
 * that match the same collection themes.
 */
const DPLA_SERIES_QUERIES: Record<string, string> = {
  'wpa-posters': 'WPA poster',
  'nasa-history': 'NASA poster',
  'patent-medicine': 'patent medicine advertisement',
  'wwii-propaganda': 'World War II propaganda poster',
};

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): {
  seriesSlug: string;
  limit: number | null;
  fixturePath: string | null;
  randomEmbeddings: boolean;
  dplaQueryOverride: string | null;
} {
  const args = process.argv.slice(2);
  const seriesArg = args.find((a) => a.startsWith('--series='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const fixtureArg = args.find((a) => a.startsWith('--fixture='));
  const dplaQueryArg = args.find((a) => a.startsWith('--dpla-query='));

  const seriesSlug = seriesArg
    ? (seriesArg.split('=')[1] ?? DEFAULT_SERIES_SLUG)
    : DEFAULT_SERIES_SLUG;

  const limitStr = limitArg ? limitArg.split('=')[1] : undefined;
  const limit = limitStr != null ? parseInt(limitStr, 10) : null;

  const fixturePath = fixtureArg ? (fixtureArg.split('=')[1] ?? null) : null;

  const dplaQueryOverride = dplaQueryArg ? (dplaQueryArg.split('=').slice(1).join('=') ?? null) : null;

  // --random-embeddings: DEV ONLY — bypasses Replicate with random 768-dim unit vectors.
  // Use this when Replicate credits are unavailable to verify the rest of the pipeline.
  const randomEmbeddings = args.includes('--random-embeddings');

  return { seriesSlug, limit, fixturePath, randomEmbeddings, dplaQueryOverride };
}

/**
 * Generates a random 768-dimension unit vector.
 * FOR DEVELOPMENT / DRY-RUN ONLY — not semantically meaningful.
 * Triggered by the --random-embeddings CLI flag.
 */
function generateRandomEmbedding(): number[] {
  const DIMENSIONS = 768;
  const raw = Array.from({ length: DIMENSIONS }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
  return raw.map((v) => v / norm);
}

// ─── Pure helpers (exported for unit tests) ───────────────────────────────────

/**
 * Computes metadata_completeness as a ratio of filled required fields.
 * Required fields: title, date_created, creator, description, nara_id, series_title.
 * Empty strings count as missing.
 */
export function computeMetadataCompleteness(partial: {
  title: string;
  date_created: string | null;
  creator: string | null;
  description: string | null;
  nara_id: string;
  series_title: string | null;
}): number {
  const values = [
    partial.title,
    partial.date_created,
    partial.creator,
    partial.description,
    partial.nara_id,
    partial.series_title,
  ];
  const filled = values.filter((v): v is string => v != null && v.length > 0).length;
  return filled / 6;
}

/**
 * Best-effort conversion of free-form date strings to ISO date format.
 * Extracts the first 4-digit year and returns "YYYY-01-01", or null if no year found.
 *
 * Examples:
 *   "ca. 1942"   → "1942-01-01"
 *   "1941-1945"  → "1941-01-01"  (takes start year)
 *   "undated"    → null
 */
export function parseDateNormalized(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = /(\d{4})/.exec(dateStr);
  return match?.[1] != null ? `${match[1]}-01-01` : null;
}

/**
 * Returns the first element of a DPLA field that may be a string or string[].
 * Returns null if the field is absent or the array is empty.
 */
function firstString(field: string | string[] | undefined): string | null {
  if (field == null) return null;
  if (Array.isArray(field)) return field[0] ?? null;
  return field;
}

/**
 * Extracts a display date string from DPLA's polymorphic date field.
 * DPLA may return a single date object or an array of date objects.
 * Prefers displayDate, falls back to begin.
 */
function extractDplaDate(date: DplaDateField | undefined): string | null {
  if (date == null) return null;
  const entry = Array.isArray(date) ? date[0] : date;
  if (entry == null) return null;
  return entry.displayDate ?? entry.begin ?? null;
}

/**
 * Attempts to extract an original NARA NAID from DPLA's identifier array.
 * DPLA items sourced from NARA often include identifiers like "NAID-2696447".
 * Returns null if no NARA identifier is found.
 */
function extractNaraId(identifiers: string | string[] | undefined): string | null {
  if (identifiers == null) return null;
  const list = Array.isArray(identifiers) ? identifiers : [identifiers];
  for (const id of list) {
    // Match patterns like "NAID-2696447" or "naid:2696447"
    const match = /(?:NAID[-:]|naId[-:])(\d+)/i.exec(id);
    if (match?.[1] != null) return match[1];
  }
  return null;
}

/**
 * Maps a raw DPLA API item to our IngestPosterData shape.
 *
 * Returns null (and the caller will skip the record) if either:
 *   - The DPLA item ID is missing (cannot identify the record)
 *   - No image URL is present (nothing to embed)
 *
 * The `nara_id` field is populated with:
 *   1. The original NARA NAID if found in sourceResource.identifier, or
 *   2. "dpla-{id}" as a stable, unique fallback identifier.
 *
 * Confidence scores and embedding are NOT set here; the caller computes them.
 */
export function mapDplaRecord(
  item: DplaItem,
  seriesId: string,
  seriesTitle: string,
): Omit<IngestPosterData, 'embedding' | 'embedding_confidence' | 'metadata_completeness' | 'overall_confidence'> | null {
  if (!item.id) return null;

  // Prefer the full-resolution hasView URL; fall back to the thumbnail object URL.
  const imageUrl = item.hasView?.[0]?.['@id'] ?? item.object ?? null;
  if (!imageUrl) return null;

  const thumbnailUrl = item.object ?? imageUrl;

  // Use original NARA ID if this item came from NARA, otherwise use DPLA's ID prefixed
  // with "dpla-" to distinguish it from NARA NAIDs and keep it globally unique.
  const naraId =
    extractNaraId(item.sourceResource.identifier) ?? `dpla-${item.id}`;

  const title = firstString(item.sourceResource.title) ?? 'Untitled';
  const description = firstString(item.sourceResource.description);
  const creator = firstString(item.sourceResource.creator);
  const dateCreated = extractDplaDate(item.sourceResource.date);
  const rightsStatement = firstString(item.sourceResource.rights);
  const physicalDescription = firstString(item.sourceResource.format);

  const subjectTags = (item.sourceResource.subject ?? [])
    .map((s) => s.name)
    .filter((n): n is string => n != null && n.length > 0);

  return {
    nara_id: naraId,
    title,
    date_created: dateCreated,
    date_normalized: parseDateNormalized(dateCreated),
    creator,
    description,
    subject_tags: subjectTags,
    series_title: seriesTitle,
    series_id: seriesId,
    physical_description: physicalDescription,
    reproduction_number: null,
    rights_statement: rightsStatement,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    ingest_version: 1,
  };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

/**
 * Parses a pgvector column value returned by Supabase PostgREST.
 * PostgREST returns vector columns as their text representation "[v1,v2,...]"
 * rather than as a parsed JSON number[]. Handles both forms for robustness.
 */
function parseVectorFromSupabase(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.every((v) => typeof v === 'number') ? (raw as number[]) : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/^\[|\]$/g, '');
    if (trimmed.length === 0) return null;
    const parsed = trimmed.split(',').map(Number);
    return parsed.some(isNaN) ? null : parsed;
  }
  return null;
}

async function getSeriesRecord(slug: string): Promise<SeriesRow> {
  const { data, error } = await supabase
    .from('series')
    .select('id, slug, title, nara_series_ref, centroid')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    throw new Error(
      `Series '${slug}' not found in database: ${error?.message ?? 'no data returned'}`,
    );
  }

  const raw = data as {
    id: string;
    slug: string;
    title: string;
    nara_series_ref: string | null;
    centroid: unknown;
  };

  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    nara_series_ref: raw.nara_series_ref,
    centroid: parseVectorFromSupabase(raw.centroid),
  };
}

// ─── DPLA API helpers ─────────────────────────────────────────────────────────

function buildDplaQueryUrl(query: string, page: number): string {
  const params = new URLSearchParams({
    q: query,
    page_size: String(DPLA_PAGE_SIZE),
    page: String(page),
    api_key: config.dplaApiKey,
  });
  return `${DPLA_API_BASE}?${params.toString()}`;
}

async function fetchDplaPage(url: string): Promise<{ items: DplaItem[]; count: number }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `DPLA API request failed: HTTP ${response.status} ${response.statusText} — ${url}`,
    );
  }

  const json = (await response.json()) as DplaApiResponse;
  return { items: json.docs ?? [], count: json.count ?? 0 };
}

/**
 * Loads a DPLA API response fixture from a local JSON file.
 * Used when `--fixture=<path>` is passed — bypasses the live DPLA API.
 * The fixture must be a JSON file shaped like DplaApiResponse.
 */
function loadFixtureItems(fixturePath: string, limit: number | null): DplaItem[] {
  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] ⚠ FIXTURE MODE — loading records from: ${fixturePath}`);
  const raw = readFileSync(fixturePath, 'utf-8');
  const parsed = JSON.parse(raw) as DplaApiResponse;
  const items = parsed.docs ?? [];
  return limit != null ? items.slice(0, limit) : items;
}

async function fetchAllDplaItems(query: string, limit: number | null): Promise<DplaItem[]> {
  const allItems: DplaItem[] = [];

  // Fetch first page to learn total count
  const firstUrl = buildDplaQueryUrl(query, 1);
  const { items: firstPage, count } = await fetchDplaPage(firstUrl);
  allItems.push(...firstPage);

  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] DPLA reports ${count} total items for query: "${query}"`);

  if (limit != null && allItems.length >= limit) {
    return allItems.slice(0, limit);
  }

  const totalPages = Math.ceil(count / DPLA_PAGE_SIZE);

  for (let page = 2; page <= totalPages; page++) {
    const url = buildDplaQueryUrl(query, page);
    const { items } = await fetchDplaPage(url);
    allItems.push(...items);

    if (limit != null && allItems.length >= limit) break;

    await sleep(500); // brief delay between pagination calls
  }

  return limit != null ? allItems.slice(0, limit) : allItems;
}

// ─── Concurrency helpers ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processInBatches<T>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processor: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map((item, j) => processor(item, i + j)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        // eslint-disable-next-line no-console
        console.error('[ingestWorker] A poster failed to process:', result.reason);
      }
    }

    const isLastBatch = i + batchSize >= items.length;
    if (!isLastBatch) {
      await sleep(delayMs);
    }
  }
}

// ─── Per-poster processing ────────────────────────────────────────────────────

async function processPoster(
  item: DplaItem,
  index: number,
  series: SeriesRow,
  useRandomEmbeddings: boolean,
): Promise<void> {
  const mapped = mapDplaRecord(item, series.id, series.title);

  if (!mapped) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ingestWorker] [${index + 1}] Skipping item ${item.id} — missing image URL`,
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[ingestWorker] [${index + 1}] Processing: ${mapped.nara_id} — "${mapped.title}"`,
  );

  if (useRandomEmbeddings) {
    // eslint-disable-next-line no-console
    console.warn(`[ingestWorker] [${index + 1}] ⚠ DEV MODE: using random embedding for ${mapped.nara_id}`);
  }
  const embedding = useRandomEmbeddings
    ? generateRandomEmbedding()
    : await generateImageEmbedding(mapped.image_url);

  const metadataCompleteness = computeMetadataCompleteness(mapped);

  // embedding_confidence = cosine similarity to series centroid, clamped to [0, 1].
  // Cosine similarity can return negative values for dissimilar vectors, but the
  // DB constraint requires BETWEEN 0 AND 1, so we clamp. Negative similarity is
  // treated as 0 confidence (the poster is an outlier from the series centroid).
  // When no centroid exists (first ingest), defaults to 0.0.
  const rawSimilarity =
    series.centroid != null ? cosineSimilarity(embedding, series.centroid) : 0.0;
  const embeddingConfidence = Math.max(0, Math.min(1, rawSimilarity));

  const overallConfidence = embeddingConfidence * 0.7 + metadataCompleteness * 0.3;

  const posterData: IngestPosterData = {
    ...mapped,
    embedding,
    embedding_confidence: embeddingConfidence,
    metadata_completeness: metadataCompleteness,
    overall_confidence: overallConfidence,
  };

  await upsertPoster(posterData);

  // eslint-disable-next-line no-console
  console.log(
    `[ingestWorker] [${index + 1}] Done: ${mapped.nara_id} ` +
      `(meta: ${metadataCompleteness.toFixed(2)}, ` +
      `embed: ${embeddingConfidence.toFixed(2)}, ` +
      `overall: ${overallConfidence.toFixed(2)})`,
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { seriesSlug, limit, fixturePath, randomEmbeddings, dplaQueryOverride } = parseArgs();

  const dplaQuery =
    dplaQueryOverride ??
    DPLA_SERIES_QUERIES[seriesSlug] ??
    seriesSlug.replace(/-/g, ' ');

  // eslint-disable-next-line no-console
  console.log(
    `[ingestWorker] Starting ingest for series: ${seriesSlug}` +
      (limit != null ? ` (limit: ${limit} posters)` : '') +
      (fixturePath != null ? ` (fixture: ${fixturePath})` : ` (DPLA query: "${dplaQuery}")`) +
      (randomEmbeddings ? ' ⚠ RANDOM EMBEDDINGS — dev mode, not for production' : ''),
  );

  const series = await getSeriesRecord(seriesSlug);
  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] Series: "${series.title}" (id: ${series.id})`);
  // eslint-disable-next-line no-console
  console.log(
    `[ingestWorker] Series centroid: ${series.centroid != null ? 'exists' : 'none — first run, embedding_confidence will be 0.0'}`,
  );

  const dplaItems =
    fixturePath != null
      ? loadFixtureItems(fixturePath, limit)
      : await fetchAllDplaItems(dplaQuery, limit);

  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] Processing ${dplaItems.length} records...`);

  await processInBatches(
    dplaItems,
    BATCH_SIZE,
    BATCH_DELAY_MS,
    (item, index) => processPoster(item, index, series, randomEmbeddings),
  );

  // eslint-disable-next-line no-console
  console.log('[ingestWorker] Updating series centroid...');
  await updateSeriesCentroid(series.id);

  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] Ingest complete for series: ${series.title}`);
}

// Guard: only run main() when this file is executed directly via tsx.
// When imported in tests, main() is NOT called.
const argv1 = process.argv[1] ?? '';
const isMainFile =
  argv1.endsWith('ingestWorker.ts') || argv1.endsWith('ingestWorker.js');

if (isMainFile) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[ingestWorker] Fatal error:', err);
    process.exit(1);
  });
}
