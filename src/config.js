import 'dotenv/config';
import { z } from 'zod';

const originsSchema = z.string().default('http://localhost:3000')
  .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
  .pipe(z.array(z.string().url()).min(1))
  .refine((origins) => origins.every((origin) => ['http:', 'https:'].includes(new URL(origin).protocol)), {
    message: 'CORS_ORIGINS entries must use http or https',
  })
  .transform((origins) => origins.map((origin) => new URL(origin).origin));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  CORS_ORIGINS: originsSchema,
  RENDER_EXTERNAL_URL: z.string().url().optional().refine(
    (value) => !value || ['http:', 'https:'].includes(new URL(value).protocol),
    { message: 'RENDER_EXTERNAL_URL must use http or https' },
  ),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
}).superRefine((env, ctx) => {
  if (Boolean(env.ADMIN_EMAIL) !== Boolean(env.ADMIN_PASSWORD)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ADMIN_EMAIL and ADMIN_PASSWORD must be configured together',
      path: ['ADMIN_EMAIL'],
    });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Please correct the environment variables and restart.');
}

export const config = {
  ...parsed.data,
  CORS_ORIGINS: [...new Set([
    ...parsed.data.CORS_ORIGINS,
    ...(parsed.data.RENDER_EXTERNAL_URL ? [new URL(parsed.data.RENDER_EXTERNAL_URL).origin] : []),
  ])],
};
