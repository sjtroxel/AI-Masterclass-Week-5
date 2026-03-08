import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { analyzeQuery } from '../services/queryAnalyzer.js';
import * as searchService from '../services/searchService.js';
import type { SearchContext } from '../services/searchService.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { SearchResponse } from '@poster-pilot/shared';

const router = Router();

// ─── Request schema ───────────────────────────────────────────────────────────

// 5 MB binary → ~6.7 MB base64 string; add headroom for the data URI prefix.
// The 8 MB body-parser override in index.ts ensures this never hits the global 1 MB cap.
const MAX_IMAGE_STRING_LENGTH = 7 * 1024 * 1024;

const searchBodySchema = z.object({
  query: z
    .string()
    .max(500, 'Query must be 500 characters or fewer')
    .optional(),
  image: z
    .string()
    .max(MAX_IMAGE_STRING_LENGTH, 'Image exceeds the 5 MB limit')
    .optional(),
  mode: z.enum(['text', 'image', 'hybrid', 'vibe']),
  series_filter: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
  // Client-generated anonymous session identifier (UUID or opaque string).
  // If absent, the route generates a random UUID so event logging always has a session.
  session_id: z.string().max(128).optional(),
});

type SearchBody = z.infer<typeof searchBodySchema>;

// ─── POST /api/search ─────────────────────────────────────────────────────────

router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Validate request body
      const parseResult = searchBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        const message = parseResult.error.issues.map((i) => i.message).join('; ');
        throw new ValidationError(message);
      }

      const body: SearchBody = parseResult.data;

      // 2. Mode-specific field requirements
      if ((body.mode === 'text' || body.mode === 'vibe') && body.query === undefined) {
        throw new ValidationError(`${body.mode} mode requires a query`);
      }
      if (body.mode === 'image' && body.image === undefined) {
        throw new ValidationError('image mode requires an image');
      }
      if (body.mode === 'hybrid' && (body.query === undefined || body.image === undefined)) {
        throw new ValidationError('hybrid mode requires both query and image');
      }

      // 3. Analyse query text (for modes that have a text component)
      const analysis = body.query !== undefined ? analyzeQuery(body.query) : null;

      // 4. Resolve effective series filter:
      //    explicit request param wins; fall back to series intent detected in query
      const effectiveSeriesFilter = body.series_filter ?? analysis?.seriesIntent ?? undefined;

      // 5. Build search context — single object threaded through all service calls.
      // exactOptionalPropertyTypes requires we omit optional keys rather than set them to undefined.
      const ctx: SearchContext = {
        sessionId: body.session_id ?? randomUUID(),
        ...(effectiveSeriesFilter !== undefined && { seriesFilter: effectiveSeriesFilter }),
        ...(body.limit !== undefined && { limit: body.limit }),
      };

      // 6. Dispatch to the correct service method
      let response: SearchResponse;

      switch (body.mode) {
        case 'text':
          response = await searchService.textSearch(analysis!, ctx);
          break;

        case 'image':
          response = await searchService.imageSearch(body.image!, ctx);
          break;

        case 'hybrid':
          response = await searchService.hybridSearch(analysis!, body.image!, ctx);
          break;

        case 'vibe':
          response = await searchService.vibeSearch(analysis!, ctx);
          break;
      }

      res.json({ data: response });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
