import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { clearSessionCookies, createSession, revokeSession, setSessionCookies } from '../middleware/session.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.trim().toLowerCase()),
  password: z.string().min(8).max(128),
}).strict();
const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(100).optional(),
});

async function establishSession(user, req, res) {
  const { sessionToken, csrfToken } = await createSession(user.id);
  setSessionCookies(res, sessionToken, csrfToken);
  if (req.session?.id) await revokeSession(req.session.id);
}

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, role: true },
  });
  await establishSession(user, req, res);
  res.status(201).json({ user });
}));

router.post('/login', validate(credentialsSchema), asyncHandler(async (req, res) => {
  const userWithHash = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!userWithHash || !(await bcrypt.compare(req.body.password, userWithHash.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const user = {
    id: userWithHash.id,
    email: userWithHash.email,
    name: userWithHash.name,
    role: userWithHash.role,
  };
  await establishSession(user, req, res);
  res.json({ user });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await revokeSession(req.session?.id);
  clearSessionCookies(res);
  res.status(204).end();
}));

export default router;
