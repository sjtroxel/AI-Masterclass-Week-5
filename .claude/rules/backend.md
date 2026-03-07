# Backend Rules — server/**

These rules apply when working in the `server/` directory.

## Express Route Structure (Explicit Logic)
Every route file follows this exact pattern — no deviation:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { posterService } from '../services/posterService.js';
import type { SearchRequest, SearchResponse } from '../../shared/types.js';

const router = Router();

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    // 1. Validate input
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Invalid poster ID' });
      return;
    }
    // 2. Call service (never inline DB queries in routes)
    const poster = await posterService.getById(id);
    if (!poster) {
      res.status(404).json({ error: 'Poster not found' });
      return;
    }
    // 3. Respond
    res.json({ data: poster });
  } catch (err) {
    next(err); // pass to global error handler
  }
});

export default router;
```

WHY: Routes that inline DB queries or business logic become untestable and create
inconsistent error handling. The service layer is the seam for unit testing.

## Service Layer Rules
- Services export plain async functions — no classes, no singletons (except the Supabase client).
- Every service function has an explicit return type.
- Services NEVER import from `routes/` — dependency flows one way: route → service → lib.
- Database errors from Supabase must be caught and re-thrown as domain errors with context.

## Error Handling
- The global error handler in `server/middleware/errorHandler.ts` is the single place
  that formats error responses. Routes never call `res.status(500)` directly.
- Use typed error classes: `NotFoundError`, `ValidationError`, `AIServiceError`.
- All errors must be logged with enough context to debug (poster ID, query parameters, etc.).

## Environment Variables
- Access env vars only through `server/lib/config.ts` — never `process.env.X` inline.
- `config.ts` validates all required vars at startup using Zod; if a required var is missing,
  the server refuses to start with a clear error message.

## Supabase Client
- The Supabase client is created once in `server/lib/supabase.ts` using the SERVICE ROLE key.
- Never expose the service role key to the client — it bypasses Row Level Security.
- Always use the anon key pattern for any client-facing auth flows.

## Anti-Patterns
- No `SELECT *` — always specify columns. The `embeddings` column is large; never fetch it
  unless performing a similarity operation.
- No string concatenation for SQL — use Supabase's query builder or parameterized RPC calls.
- No synchronous file I/O in request handlers — use `fs.promises` if file access is needed.
- No `setTimeout`/`setInterval` in route handlers — use a proper job queue for background work.
