import { type Request, type Response, type NextFunction } from 'express';

// ─── Typed Error Classes ───────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class AIServiceError extends AppError {
  constructor(message = 'AI service unavailable') {
    super(503, 'AI_SERVICE_ERROR', message);
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Must be registered as the LAST middleware in index.ts (4-arg signature is required).

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction, // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (err instanceof AppError) {
    // eslint-disable-next-line no-console
    console.error(`[${err.code}] ${req.method} ${req.path} — ${err.message}`);
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Unknown/unexpected error — always log the real cause server-side.
  // In production, never leak internals to the client.
  // eslint-disable-next-line no-console
  console.error(`[INTERNAL_ERROR] ${req.method} ${req.path}`, err);
  res.status(500).json({
    error: isProduction ? 'Internal server error' : String(err),
    code: 'INTERNAL_ERROR',
  });
}
