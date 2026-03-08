import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, NextFunction } from 'express';
import {
  AppError,
  NotFoundError,
  ValidationError,
  AIServiceError,
  errorHandler,
} from '../middleware/errorHandler.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockRes = {
  _statusCode: number;
  _body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
};

function mockReqRes(path = '/api/test') {
  const req = { method: 'GET', path } as Request;
  const res: MockRes = {
    _statusCode: 200,
    _body: null,
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  const next = vi.fn() as unknown as NextFunction;
  // Cast to the Express Response type that errorHandler expects
  return { req, res, next };
}

// ─── Error class shape ────────────────────────────────────────────────────────

describe('AppError subclasses', () => {
  it('NotFoundError has statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err instanceof AppError).toBe(true);
  });

  it('ValidationError has statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
  });

  it('AIServiceError has statusCode 503 and code AI_SERVICE_ERROR', () => {
    const err = new AIServiceError();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('AI_SERVICE_ERROR');
  });
});

// ─── errorHandler middleware ──────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('formats NotFoundError as HTTP 404', () => {
    const { req, res, next } = mockReqRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(new NotFoundError('Poster not found'), req, res as any, next);
    expect(res._statusCode).toBe(404);
    expect(res._body).toEqual({ error: 'Poster not found', code: 'NOT_FOUND' });
  });

  it('formats ValidationError as HTTP 400', () => {
    const { req, res, next } = mockReqRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(new ValidationError('Query too long'), req, res as any, next);
    expect(res._statusCode).toBe(400);
    expect(res._body).toEqual({ error: 'Query too long', code: 'VALIDATION_ERROR' });
  });

  it('formats unknown errors as HTTP 500 and hides message in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { req, res, next } = mockReqRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(new Error('secret internal detail'), req, res as any, next);
    expect(res._statusCode).toBe(500);
    expect(res._body).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  it('exposes unknown error message outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { req, res, next } = mockReqRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(new Error('debug detail'), req, res as any, next);
    expect(res._statusCode).toBe(500);
    expect((res._body as { error: string }).error).toContain('debug detail');
  });
});
