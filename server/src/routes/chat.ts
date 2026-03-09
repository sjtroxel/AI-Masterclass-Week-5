import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import * as archivistService from '../services/archivistService.js';
import { ValidationError } from '../middleware/errorHandler.js';

const router = Router();

// ─── Validation helpers ───────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidString = z.string().regex(UUID_REGEX, 'Must be a valid UUID');

// ─── Request schema ───────────────────────────────────────────────────────────

const chatBodySchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: uuidString,
  poster_context_ids: z.array(uuidString).max(5),
  // Similarity scores keyed by poster UUID — drives the confidence clause and
  // per-poster score display in the context XML. Optional; defaults to {}.
  poster_similarity_scores: z.record(z.string(), z.number()).optional(),
});

type ChatBody = z.infer<typeof chatBodySchema>;

// ─── POST /api/chat ───────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // 1. Validate body
  const parseResult = chatBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    const message = parseResult.error.issues.map((i) => i.message).join('; ');
    next(new ValidationError(message));
    return;
  }

  const body: ChatBody = parseResult.data;

  // 2. Guard: keys in similarity scores must be UUIDs present in poster_context_ids
  const contextIdSet = new Set(body.poster_context_ids);
  for (const scoreId of Object.keys(body.poster_similarity_scores ?? {})) {
    if (!UUID_REGEX.test(scoreId) || !contextIdSet.has(scoreId)) {
      next(
        new ValidationError(
          'poster_similarity_scores keys must be valid UUIDs present in poster_context_ids',
        ),
      );
      return;
    }
  }

  // 3. Set SSE response headers. Headers are flushed immediately so the client
  //    knows the connection is established before the first token arrives.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 4. Delegate to the service — zero business logic in this route.
  await archivistService.streamResponse(
    {
      sessionId: body.session_id,
      message: body.message,
      posterContextIds: body.poster_context_ids,
      posterSimilarityScores: body.poster_similarity_scores ?? {},
    },
    res,
    next,
  );
});

export default router;
