export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFound(req, res, next) {
  next(new HttpError(404, 'Not found'));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON request body' });
  }
  if (error?.code === 'P2002') return res.status(409).json({ error: 'A record with that value already exists' });
  if (error?.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
  if (error?.code === 'P2003') return res.status(400).json({ error: 'Referenced record does not exist' });

  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
}
