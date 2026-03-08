import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import * as posterService from '../services/posterService.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { SeriesPageResponse } from '@poster-pilot/shared';

const router = Router();

// Series slugs are lowercase alphanumeric with hyphens (e.g., "wpa-posters").
const SLUG_REGEX = /^[a-z0-9-]+$/;

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── GET /api/series/:slug ────────────────────────────────────────────────────

router.get(
  '/:slug',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Express v5 types req.params values as string | string[]; route params are
      // always single strings in practice — narrow defensively.
      const rawSlug = req.params['slug'];
      const slug = typeof rawSlug === 'string' ? rawSlug : undefined;
      if (!slug || !SLUG_REGEX.test(slug)) {
        throw new ValidationError(`Invalid series slug${slug ? `: ${slug}` : ''}`);
      }

      const parseResult = pageQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        const message = parseResult.error.issues.map((i) => i.message).join('; ');
        throw new ValidationError(message);
      }

      const { page, limit } = parseResult.data;

      const result: SeriesPageResponse = await posterService.getBySeriesSlug(slug, page, limit);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
