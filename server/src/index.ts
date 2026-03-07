import express, { type Request, type Response } from 'express';
import type { HealthResponse } from '@poster-pilot/shared';

const app = express();
const PORT = Number(process.env['PORT'] ?? 3001);

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req: Request, res: Response): void => {
  const body: HealthResponse = { status: 'ok' };
  res.json(body);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});
