import test from 'node:test';
import assert from 'node:assert/strict';
import { csrfTokensMatch, isStateChangingMethod, tokenHash } from '../src/services/session.js';
import { hasAdminRole } from '../src/middleware/auth.js';
import { productImageUrlSchema } from '../src/services/product-image.js';

test('CSRF token must match cookie, request header, and stored session hash', () => {
  const token = 'csrf-random-token';
  const hash = tokenHash(token);
  assert.equal(csrfTokensMatch(token, token, hash), true);
  assert.equal(csrfTokensMatch(token, 'different', hash), false);
  assert.equal(csrfTokensMatch(token, token, tokenHash('other-session-token')), false);
  assert.equal(csrfTokensMatch(undefined, token, hash), false);
});

test('safe HTTP methods do not require CSRF; mutations do', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(isStateChangingMethod(method), false);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(isStateChangingMethod(method), true);
});

test('administrator authorization checks the current persisted role', () => {
  assert.equal(hasAdminRole({ role: 'ADMIN' }), true);
  assert.equal(hasAdminRole({ role: 'CUSTOMER' }), false);
  assert.equal(hasAdminRole(undefined), false);
});

test('product images allow safe same-origin assets and HTTPS only', () => {
  assert.equal(productImageUrlSchema.safeParse('/assets/caps/black-cap.webp').success, true);
  assert.equal(productImageUrlSchema.safeParse('https://images.example/cap.webp').success, true);
  assert.equal(productImageUrlSchema.safeParse('/assets/../private/file.webp').success, false);
  assert.equal(productImageUrlSchema.safeParse('http://images.example/cap.webp').success, false);
});
