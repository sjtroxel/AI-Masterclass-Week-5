/**
 * Ingest Worker — Phase 3.4
 *
 * Entry point: tsx server/workers/ingestWorker.ts [--series=<slug>] [--limit=<n>]
 *
 * Fetches poster records from the NARA Catalog API v2, generates CLIP image
 * embeddings via Replicate, and upserts rows into the Supabase `posters` table.
 *
 * CLI options:
 *   --series=<slug>  Series slug to ingest (default: wpa-posters)
 *   --limit=<n>      Cap total posters processed — useful for test runs
 *
 * Examples:
 *   tsx server/workers/ingestWorker.ts
 *   tsx server/workers/ingestWorker.ts --series=wpa-posters --limit=5
 */

import { readFileSync } from 'fs';
import { config } from '../lib/config.js';
import { supabase } from '../lib/supabase.js';
import { generateImageEmbedding } from '../services/clipService.js';
import { upsertPoster, updateSeriesCentroid } from '../services/posterService.js';
import { cosineSimilarity } from '../lib/vectorMath.js';
import type { IngestPosterData } from '@poster-pilot/shared';

// ─── NARA Catalog API v2 types ────────────────────────────────────────────────
//
// Field paths are based on NARA Catalog API v2 (catalog.archives.gov/api/v2/).
//
// ⚠ VERIFY BEFORE PRODUCTION: Run a manual request against the live API and
//   confirm these field names match the actual response structure.
//   Key paths to verify:
//     body.hits.hits[]._source.naId         → NARA record identifier
//     body.hits.hits[]._source.scopeAndContentNote → description
//     body.hits.hits[]._source.coverageDate → date (string or { logicalDate })
//     body.hits.hits[]._source.creators[]   → { displayName } or string
//     body.hits.hits[]._source.objects[].file.url    → full-res image URL
//     body.hits.hits[]._source.objects[].thumbnail.url → thumbnail URL
//     body.hits.hits[]._source.subjectHeadings[].termName → subject tags
//     body.hits.hits[]._source.parentSeries.title    → series title confirmation

export type NaraDigitalObject = {
  file?: { url?: string };
  thumbnail?: { url?: string };
};

export type NaraRawRecord = {
  naId?: number | string;
  title?: string;
  scopeAndContentNote?: string;
  coverageDate?: string | { logicalDate?: string };
  creators?: Array<{ displayName?: string } | string>;
  objects?: NaraDigitalObject[];
  parentSeries?: { naId?: number | string; title?: string };
  subjectHeadings?: Array<{ termName?: string }>;
  physicalDescription?: string;
  reproductionNumber?: string;
};

type NaraHit = { _id?: string; _source?: NaraRawRecord };

type NaraApiResponse = {
  body?: {
    hits?: {
      total?: { value?: number };
      hits?: NaraHit[];
    };
  };
};

type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  nara_series_ref: string | null;
  centroid: number[] | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const NARA_API_BASE = 'https://catalog.archives.gov/api/v2/';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const NARA_PAGE_SIZE = 100;
const DEFAULT_SERIES_SLUG = 'wpa-posters';

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): {
  seriesSlug: string;
  limit: number | null;
  fixturePath: string | null;
  randomEmbeddings: boolean;
} {
  const args = process.argv.slice(2);
  const seriesArg = args.find((a) => a.startsWith('--series='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const fixtureArg = args.find((a) => a.startsWith('--fixture='));

  const seriesSlug = seriesArg
    ? (seriesArg.split('=')[1] ?? DEFAULT_SERIES_SLUG)
    : DEFAULT_SERIES_SLUG;

  const limitStr = limitArg ? limitArg.split('=')[1] : undefined;
  const limit = limitStr != null ? parseInt(limitStr, 10) : null;

  const fixturePath = fixtureArg ? (fixtureArg.split('=')[1] ?? null) : null;

  // --random-embeddings: DEV ONLY — bypasses Replicate with random 768-dim unit vectors.
  // Use this when Replicate credits are unavailable to verify the rest of the pipeline.
  const randomEmbeddings = args.includes('--random-embeddings');

  return { seriesSlug, limit, fixturePath, randomEmbeddings };
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
 * Best-effort conversion of NARA's free-form date strings to ISO date format.
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
 * Maps a raw NARA Catalog API v2 record to our IngestPosterData shape.
 *
 * Returns null (and the caller will skip the record) if either:
 *   - naId is missing (cannot identify the record)
 *   - No image URL is present (nothing to embed)
 *
 * Confidence scores and embedding are NOT set here; the caller computes them.
 */
export function mapNaraRecord(
  raw: NaraRawRecord,
  seriesId: string,
  seriesTitle: string,
): Omit<IngestPosterData, 'embedding' | 'embedding_confidence' | 'metadata_completeness' | 'overall_confidence'> | null {
  const naraId = raw.naId != null ? String(raw.naId) : null;
  if (!naraId) return null;

  const imageUrl = raw.objects?.[0]?.file?.url ?? null;
  if (!imageUrl) return null;

  const thumbnailUrl = raw.objects?.[0]?.thumbnail?.url ?? imageUrl;

  const firstCreator = raw.creators?.[0];
  const creator =
    firstCreator == null
      ? null
      : typeof firstCreator === 'string'
        ? firstCreator
        : (firstCreator.displayName ?? null);

  const rawDate = raw.coverageDate;
  const dateCreated =
    typeof rawDate === 'string'
      ? rawDate
      : rawDate?.logicalDate ?? null;

  const subjectTags = (raw.subjectHeadings ?? [])
    .map((h) => h.termName)
    .filter((t): t is string => t != null);

  return {
    nara_id: naraId,
    title: raw.title ?? 'Untitled',
    date_created: dateCreated,
    date_normalized: parseDateNormalized(dateCreated),
    creator,
    description: raw.scopeAndContentNote ?? null,
    subject_tags: subjectTags,
    series_title: seriesTitle,
    series_id: seriesId,
    physical_description: raw.physicalDescription ?? null,
    reproduction_number: raw.reproductionNumber ?? null,
    rights_statement: null,
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

  // Cast to an intermediate type to safely extract and parse the centroid.
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

// ─── NARA API helpers ─────────────────────────────────────────────────────────

function buildNaraQueryUrl(seriesRef: string | null, offset: number, rows: number): string {
  const params = new URLSearchParams({
    resultTypes: 'item',
    rows: String(rows),
    offset: String(offset),
  });

  if (seriesRef != null) {
    // Strip prefix (e.g. 'ARC-558544' → '558544', 'NAID-17490055' → '17490055')
    // Requires at least 5 digits to avoid matching short codes like 'RG-88'
    const numericId = /-(\d{5,})/.exec(seriesRef)?.[1];
    if (numericId != null) {
      params.set('parentNaId', numericId);
    } else {
      // Fall back to a text search using the raw series ref
      params.set('q', `"${seriesRef}"`);
    }
  }

  return `${NARA_API_BASE}?${params.toString()}`;
}

async function fetchNaraPage(
  url: string,
): Promise<{ records: NaraRawRecord[]; total: number }> {
  const response = await fetch(url, {
    headers: { 'x-api-key': config.naraApiKey },
  });

  if (!response.ok) {
    throw new Error(
      `NARA API request failed: HTTP ${response.status} ${response.statusText} — ${url}`,
    );
  }

  const json = (await response.json()) as NaraApiResponse;
  const hits = json.body?.hits?.hits ?? [];
  const total = json.body?.hits?.total?.value ?? 0;
  const records = hits
    .map((h) => h._source)
    .filter((s): s is NaraRawRecord => s != null);

  return { records, total };
}

/**
 * Loads a NARA API response fixture from a local JSON file.
 * Used when `--fixture=<path>` is passed — bypasses the live NARA API.
 * Mirrors the shape of `fetchAllNaraRecords` so the rest of the pipeline is identical.
 */
function loadFixtureRecords(fixturePath: string, limit: number | null): NaraRawRecord[] {
  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] ⚠ FIXTURE MODE — loading records from: ${fixturePath}`);
  const raw = readFileSync(fixturePath, 'utf-8');
  const parsed = JSON.parse(raw) as NaraApiResponse;
  const hits = parsed.body?.hits?.hits ?? [];
  const records = hits
    .map((h) => h._source)
    .filter((s): s is NaraRawRecord => s != null);
  return limit != null ? records.slice(0, limit) : records;
}

async function fetchAllNaraRecords(
  seriesRef: string | null,
  limit: number | null,
): Promise<NaraRawRecord[]> {
  const allRecords: NaraRawRecord[] = [];

  // Fetch first page to learn the total count
  const firstUrl = buildNaraQueryUrl(seriesRef, 0, NARA_PAGE_SIZE);
  const { records: firstPage, total } = await fetchNaraPage(firstUrl);
  allRecords.push(...firstPage);

  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] NARA reports ${total} total records for this series`);

  if (limit != null && allRecords.length >= limit) {
    return allRecords.slice(0, limit);
  }

  let offset = NARA_PAGE_SIZE;

  while (offset < total) {
    const url = buildNaraQueryUrl(seriesRef, offset, NARA_PAGE_SIZE);
    const { records } = await fetchNaraPage(url);
    allRecords.push(...records);
    offset += NARA_PAGE_SIZE;

    if (limit != null && allRecords.length >= limit) break;

    await sleep(500); // brief delay between pagination calls
  }

  return limit != null ? allRecords.slice(0, limit) : allRecords;
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
  raw: NaraRawRecord,
  index: number,
  series: SeriesRow,
  useRandomEmbeddings: boolean,
): Promise<void> {
  const mapped = mapNaraRecord(raw, series.id, series.title);

  if (!mapped) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ingestWorker] [${index + 1}] Skipping record — missing nara_id or image_url`,
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
  const { seriesSlug, limit, fixturePath, randomEmbeddings } = parseArgs();

  // eslint-disable-next-line no-console
  console.log(
    `[ingestWorker] Starting ingest for series: ${seriesSlug}` +
      (limit != null ? ` (limit: ${limit} posters)` : '') +
      (fixturePath != null ? ` (fixture: ${fixturePath})` : '') +
      (randomEmbeddings ? ' ⚠ RANDOM EMBEDDINGS — dev mode, not for production' : ''),
  );

  const series = await getSeriesRecord(seriesSlug);
  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] Series: "${series.title}" (id: ${series.id})`);
  // eslint-disable-next-line no-console
  console.log(
    `[ingestWorker] Series centroid: ${series.centroid != null ? 'exists' : 'none — first run, embedding_confidence will be 0.0'}`,
  );

  const rawRecords =
    fixturePath != null
      ? loadFixtureRecords(fixturePath, limit)
      : await fetchAllNaraRecords(series.nara_series_ref, limit);
  // eslint-disable-next-line no-console
  console.log(`[ingestWorker] Processing ${rawRecords.length} records...`);

  await processInBatches(
    rawRecords,
    BATCH_SIZE,
    BATCH_DELAY_MS,
    (record, index) => processPoster(record, index, series, randomEmbeddings),
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
