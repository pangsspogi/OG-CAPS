import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'ogcaps_session';
export const CSRF_COOKIE = 'ogcaps_csrf';

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function newOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function csrfTokensMatch(cookieToken, headerToken, storedHash) {
  if (!cookieToken || !headerToken || !storedHash) return false;
  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);
  if (cookieBytes.length !== headerBytes.length || !timingSafeEqual(cookieBytes, headerBytes)) return false;
  return tokenHash(headerToken) === storedHash;
}

export function isStateChangingMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
