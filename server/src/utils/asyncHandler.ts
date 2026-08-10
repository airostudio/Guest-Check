import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so rejections reach Express's error handler.
 *
 * Express 4 does not await handler return values, so a rejected promise is an
 * unhandled rejection: under Node 18's default --unhandled-rejections=throw it
 * terminates the lambda. The client receives no JSON body, the request hangs
 * until Vercel's 30s timeout, and nothing reaches errorHandler's logger.
 *
 * Reachable from ordinary input — e.g. any PostgREST 400 — so every async
 * handler must be wrapped.
 *
 * Express 5 does this natively; drop this helper on upgrade.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}

export default asyncHandler;
