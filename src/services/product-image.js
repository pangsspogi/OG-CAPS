import { z } from 'zod';

const localImagePathSchema = z.string().max(2000)
  .regex(/^\/assets\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/, 'Image path must be a safe /assets/ path');
const remoteImageUrlSchema = z.string().url().max(2000)
  .refine((url) => {
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Remote image URL must use HTTPS');

export const productImageUrlSchema = z.union([localImagePathSchema, remoteImageUrlSchema]);

export function getProductImageExtension(contentType, buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (contentType === 'image/jpeg' && buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (contentType === 'image/png' && buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (contentType === 'image/webp' && buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
