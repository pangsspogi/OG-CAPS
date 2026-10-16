import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import {
  csrfTokensMatch,
  CSRF_COOKIE,
  isStateChangingMethod,
  newOpaqueToken,
  SESSION_COOKIE,
  tokenHash,
} from '../services/session.js';

const maxAgeMs = config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const secure = config.NODE_ENV === 'production';
const cookieOptions = { sameSite: 'lax', secure, path: '/', maxAge: maxAgeMs };

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = '';
    }
  }
  return cookies;
}

export function setSessionCookies(res, sessionToken, csrfToken) {
  res.cookie(SESSION_COOKIE, sessionToken, { ...cookieOptions, httpOnly: true });
  res.cookie(CSRF_COOKIE, csrfToken, { ...cookieOptions, httpOnly: false });
}

export function clearSessionCookies(res) {
  const clearOptions = { sameSite: 'lax', secure, path: '/' };
  res.clearCookie(SESSION_COOKIE, clearOptions);
  res.clearCookie(CSRF_COOKIE, clearOptions);
}

export async function createSession(userId) {
  const sessionToken = newOpaqueToken();
  const csrfToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + maxAgeMs);
  const session = await prisma.session.create({
    data: {
      id: tokenHash(sessionToken),
      userId,
      csrfHash: tokenHash(csrfToken),
      expiresAt,
    },
  });
  return { session, sessionToken, csrfToken };
}

export const loadSession = asyncHandler(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  req.cookies = parseCookies(req.get('cookie'));
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return next();

  const session = await prisma.session.findUnique({
    where: { id: tokenHash(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session) return next();
  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return next();
  }
  req.session = session;
  req.user = session.user;
  return next();
});

export function csrfProtection(req, res, next) {
  if (!req.session || !isStateChangingMethod(req.method)) return next();
  if (!csrfTokensMatch(req.cookies[CSRF_COOKIE], req.get('x-csrf-token'), req.session.csrfHash)) {
    return next(new HttpError(403, 'Valid CSRF token required'));
  }
  return next();
}

export async function revokeSession(sessionId) {
  if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
}

export { CSRF_COOKIE, SESSION_COOKIE };
