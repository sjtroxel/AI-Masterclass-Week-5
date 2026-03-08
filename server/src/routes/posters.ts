import { Router, type Request, type Response, type NextFunction } from 'express';
import * as posterService from '../services/posterService.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { Poster, VisualSibling } from '@poster-pilot/shared';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUUID(raw: string | string[] | undefined): asserts raw is string {
  // Express route params are always a single string, but the v5 types include string[]
  // for compatibility with query-string parsers. We narrow defensively.
  const id = typeof raw === 'string' ? raw : undefined;
  if (!id || !UUID_REGEX.test(id)) {
    throw new ValidationError(`Invalid poster ID format${id ? `: ${id}` : ''}`);
  }
}

// ─── GET /api/posters/:id ─────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'];
      assertValidUUID(id);

      const poster: Poster = await posterService.getById(id);
      res.json({ data: poster });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/posters/:id/siblings ───────────────────────────────────────────

router.get(
  '/:id/siblings',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'];
      assertValidUUID(id);

      // Validate poster existence first — avoids undefined RPC behaviour when
      // source_poster_id has no matching row (NULL embedding → unordered results).
      await posterService.getById(id);

      const siblings: VisualSibling[] = await posterService.getVisualSiblings(id);
      res.json({ data: siblings });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
