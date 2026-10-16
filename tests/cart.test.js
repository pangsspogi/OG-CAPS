import test from 'node:test';
import assert from 'node:assert/strict';
import { cartInputSchema, priceCart } from '../src/services/cart.js';

test('cart input merges repeated product rows and enforces a combined quantity cap', () => {
  const parsed = cartInputSchema.parse({
    items: [{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 3 }],
  });
  assert.deepEqual(parsed.items, [{ productId: 'p1', quantity: 5 }]);

  assert.equal(cartInputSchema.safeParse({
    items: [{ productId: 'p1', quantity: 99 }, { productId: 'p1', quantity: 1 }],
  }).success, false);
});

test('cart pricing uses persisted product prices, not client-provided values', () => {
  const cart = priceCart(
    [{ productId: 'p1', quantity: 2 }],
    [{ id: 'p1', slug: 'cap', name: 'Cap', imageUrl: null, priceCents: 2599, currency: 'usd', stock: 3, active: true, isSample: false }],
  );
  assert.equal(cart.totalCents, 5198);
  assert.equal(cart.items[0].unitPriceCents, 2599);
});

test('cart pricing rejects insufficient stock and inactive products', () => {
  const product = { id: 'p1', slug: 'cap', name: 'Cap', imageUrl: null, priceCents: 1000, currency: 'usd', stock: 1, active: true, isSample: false };
  assert.throws(() => priceCart([{ productId: 'p1', quantity: 2 }], [product]), /insufficient stock/);
  assert.throws(() => priceCart([{ productId: 'p1', quantity: 1 }], [{ ...product, active: false }]), /unavailable/);
});

test('sample catalog products cannot be purchased', () => {
  const product = { id: 'p1', slug: 'sample-cap', name: 'SAMPLE ONLY cap', imageUrl: null, priceCents: 1000, currency: 'usd', stock: 20, active: true, isSample: true };
  assert.throws(() => priceCart([{ productId: 'p1', quantity: 1 }], [product]), /cannot be purchased/);
});
