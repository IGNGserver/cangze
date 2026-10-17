/** Application error with a stable machine-readable code. Rendered as the ApiError envelope. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Forbidden', code = 'forbidden') => new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);
export const tooMany = (message = 'Too many requests') => new AppError(429, 'rate_limited', message);
export const unavailable = (message: string, code = 'unavailable') => new AppError(503, code, message);
