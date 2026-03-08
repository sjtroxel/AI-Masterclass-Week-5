import { Router, type Request, type Response } from 'express';

const router = Router();

// Placeholder — implemented in Phase 6
router.use((_req: Request, res: Response): void => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' });
});

export default router;
