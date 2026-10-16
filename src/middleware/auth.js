import { HttpError, asyncHandler } from '../errors.js';

export const requireAuth = (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  return next();
};

export function requireAdmin(req, res, next) {
  if (!hasAdminRole(req.user)) return next(new HttpError(403, 'Administrator access required'));
  return next();
}

export function hasAdminRole(user) {
  return user?.role === 'ADMIN';
}
