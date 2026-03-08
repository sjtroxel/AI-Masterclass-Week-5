// config must be the first import — exits immediately if env vars are missing
import { config } from './lib/config.js';

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { supabase } from './lib/supabase.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import type { HealthResponse } from '@poster-pilot/shared';
import postersRouter from './routes/posters.js';
import searchRouter from './routes/search.js';
import chatRouter from './routes/chat.js';

const app = express();

// ── Security middleware — strict order per security.md ────────────────────────
app.use(helmet());
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', code: 'RATE_LIMITED' },
  }),
);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get(
  '/api/health',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // SELECT 1 equivalent — queries a known table to confirm live DB connectivity
      const { error } = await supabase.from('series').select('id').limit(1);
      if (error) {
        res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
        return;
      }
      const body: HealthResponse = {
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

app.use('/api/posters', postersRouter);
app.use('/api/search', searchRouter);
app.use('/api/chat', chatRouter);

// ── 404 handler — must come after all routes ──────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError('Route not found'));
});

// ── Global error handler — must be last ──────────────────────────────────────
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Running on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[server] CORS origin: ${config.clientOrigin}`);
});
