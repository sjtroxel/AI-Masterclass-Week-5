import Replicate from 'replicate';
import { config } from '../lib/config.js';
import { preprocessText } from '../lib/clipPreprocessor.js';
import { AIServiceError } from '../middleware/errorHandler.js';

const CLIP_DIMENSIONS = 768;
const MAX_CONCURRENT_REQUESTS = 5;

// ─── Semaphore ────────────────────────────────────────────────────────────────
// Caps concurrent Replicate API calls at MAX_CONCURRENT_REQUESTS.
// Module-internal — not exported.

type Release = () => void;

function createSemaphore(permits: number): { acquire: () => Promise<Release> } {
  let available = permits;
  const queue: Array<() => void> = [];

  function release(): void {
    const next = queue.shift();
    if (next) {
      // Hand the permit directly to the next waiter; available stays the same.
      next();
    } else {
      available++;
    }
  }

  function acquire(): Promise<Release> {
    if (available > 0) {
      available--;
      return Promise.resolve(release);
    }
    return new Promise<Release>((resolve) => {
      queue.push(() => resolve(release));
    });
  }

  return { acquire };
}

const semaphore = createSemaphore(MAX_CONCURRENT_REQUESTS);

// ─── Replicate client ─────────────────────────────────────────────────────────

const replicateClient = new Replicate({ auth: config.replicateApiKey });

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Unwraps common object-wrapper patterns before validation.
 * Some Replicate models return { embedding: [...] } rather than a bare array.
 */
function unwrapEmbedding(output: unknown): unknown {
  if (Array.isArray(output)) return output;

  if (output !== null && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    for (const key of ['embedding', 'embeddings', 'features', 'output', 'vector', 'values']) {
      if (Array.isArray(obj[key])) return obj[key];
    }
    // Log actual keys so the next error message is actionable.
    // eslint-disable-next-line no-console
    console.error('[clipService] Unrecognised object shape — keys:', Object.keys(obj));
  }

  return output; // Fall through to validateEmbedding for a descriptive error.
}

function validateEmbedding(raw: unknown): number[] {
  const output = unwrapEmbedding(raw);
  if (
    !Array.isArray(output) ||
    output.length !== CLIP_DIMENSIONS ||
    !output.every((v) => typeof v === 'number')
  ) {
    const shape = Array.isArray(output)
      ? `array of length ${output.length}`
      : typeof output;
    throw new AIServiceError(
      `CLIP model returned unexpected output: expected ${CLIP_DIMENSIONS}-dimension number array, got ${shape}`,
    );
  }
  return output;
}

async function normalizeToBase64(imageUrl: string): Promise<string> {
  // Already a data URI — pass through without fetching.
  if (imageUrl.startsWith('data:')) return imageUrl;

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new AIServiceError(
      `Failed to fetch image for embedding: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/** Extracts retry_after seconds from a Replicate 429 error message, or returns null. */
function extractRetryAfter(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/"retry_after"\s*:\s*(\d+(?:\.\d+)?)/);
  return match ? Math.ceil(parseFloat(match[1])) : null;
}

async function runClipModel(
  input: { text: string } | { image: string },
  attempt = 0,
): Promise<number[]> {
  const release = await semaphore.acquire();
  const startMs = Date.now();

  try {
    // Template literal satisfies Replicate's `${string}/${string}:${string}` type.
    // Model: openai/clip — 768-dim ViT-L/14, accepts both `text` and `image` inputs.
    // (cjwbw/clip-vit-large-patch14 only exposes the image encoder.)
    const modelRef =
      `openai/clip:${config.clipModelVersion}` as `${string}/${string}:${string}`;

    const output = await replicateClient.run(modelRef, { input });
    const latencyMs = Date.now() - startMs;

    // eslint-disable-next-line no-console
    console.log(`[clipService] Replicate CLIP call completed in ${latencyMs}ms`);

    return validateEmbedding(output);
  } catch (err) {
    // Re-throw domain errors as-is.
    if (err instanceof AIServiceError) throw err;

    // Retry once on 429 after the suggested delay (ingest fires 5 concurrent requests
    // which saturates Replicate's burst limit on low-credit accounts).
    if (attempt === 0 && err instanceof Error && err.message.includes('status 429')) {
      const waitSec = (extractRetryAfter(err) ?? 15) + 1;
      // eslint-disable-next-line no-console
      console.warn(`[clipService] Rate limited by Replicate. Waiting ${waitSec}s then retrying…`);
      await new Promise<void>((resolve) => setTimeout(resolve, waitSec * 1000));
      return runClipModel(input, 1);
    }

    throw new AIServiceError(
      `Replicate API call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    release();
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Generates a 768-dimension CLIP text embedding.
 * The input is preprocessed (lowercased, punctuation stripped, truncated to 77 tokens)
 * before being sent to Replicate.
 */
export async function generateTextEmbedding(text: string): Promise<number[]> {
  const preprocessed = preprocessText(text);
  return runClipModel({ text: preprocessed });
}

/**
 * Generates a 768-dimension CLIP image embedding.
 * Accepts either an HTTPS URL or a base64 data URI.
 * URLs are fetched and converted to base64 internally before the Replicate call.
 */
export async function generateImageEmbedding(imageUrl: string): Promise<number[]> {
  const base64 = await normalizeToBase64(imageUrl);
  return runClipModel({ image: base64 });
}
