import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductImageExtension } from '../src/services/product-image.js';

test('product image upload accepts matching JPEG, PNG, and WebP signatures', () => {
  assert.equal(getProductImageExtension('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'jpg');
  assert.equal(getProductImageExtension('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(getProductImageExtension('image/webp', Buffer.from('RIFF0000WEBP', 'ascii')), 'webp');
});

test('product image upload rejects mismatched or unsupported file signatures', () => {
  assert.equal(getProductImageExtension('image/jpeg', Buffer.from('not an image')), null);
  assert.equal(getProductImageExtension('image/svg+xml', Buffer.from('<svg/>')), null);
  assert.equal(getProductImageExtension('image/webp', Buffer.from('RIFF0000JPEG', 'ascii')), null);
});
