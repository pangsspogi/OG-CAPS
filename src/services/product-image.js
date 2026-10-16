import { z } from 'zod';

const localImagePathSchema = z.string().max(2000)
  .regex(/^\/assets\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/, 'Image path must be a safe /assets/ path');
const remoteImageUrlSchema = z.string().url().max(2000)
  .refine((url) => new URL(url).protocol === 'https:', 'Remote image URL must use HTTPS');

export const productImageUrlSchema = z.union([localImagePathSchema, remoteImageUrlSchema]);
