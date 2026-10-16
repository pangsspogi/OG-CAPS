import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler, HttpError, notFound } from './errors.js';
import authRoutes from './routes/auth.js';
import cartRoutes from './routes/cart.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes, { handleStripeWebhook } from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import { csrfProtection, loadSession } from './middleware/session.js';

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '../public');

app.disable('x-powered-by');
if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
    },
  },
}));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || config.CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new HttpError(403, 'Origin is not allowed by CORS'));
  },
}));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api', apiLimiter);

const webhookHandler = async (req, res, next) => {
  try {
    await handleStripeWebhook(req.body, req.get('stripe-signature'));
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};
for (const prefix of ['/api/v1', '/api']) {
  app.post(`${prefix}/payments/webhook`, express.raw({ type: 'application/json', limit: '256kb' }), webhookHandler);
}

app.use(express.json({ limit: '32kb' }));
app.use('/api', loadSession);

for (const prefix of ['/api/v1', '/api']) {
  app.use(prefix, csrfProtection);
  app.get(`${prefix}/health`, (req, res) => res.json({ status: 'ok' }));
  app.use(`${prefix}/auth`, authLimiter, authRoutes);
  app.use(prefix, catalogRoutes);
  app.use(`${prefix}/cart`, cartRoutes);
  app.use(`${prefix}/orders`, orderRoutes);
  app.use(`${prefix}/admin`, adminRoutes);
  app.use(prefix, (req, res, next) => next(new HttpError(404, 'API endpoint not found')));
}

app.use(express.static(publicDir, { index: false, fallthrough: true }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/api') return next(new HttpError(404, 'API endpoint not found'));
  if (!req.accepts('html')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use(notFound);
app.use(errorHandler);

export default app;
