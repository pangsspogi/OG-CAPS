import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMinorAmount } from '../public/js/currency.js';

test('currency conversion switches between USD and PHP minor units', () => {
  assert.equal(convertMinorAmount(3200, 'USD', 'PHP', 57.5), 184000);
  assert.equal(convertMinorAmount(184000, 'PHP', 'USD', 57.5), 3200);
  assert.equal(convertMinorAmount(3200, 'USD', 'USD', 57.5), 3200);
});

test('currency conversion rounds to minor units and rejects invalid values', () => {
  assert.equal(convertMinorAmount(100, 'USD', 'PHP', 57.5), 5750);
  assert.equal(convertMinorAmount(1, 'PHP', 'USD', 57.5), 0);
  assert.throws(() => convertMinorAmount(-1, 'USD', 'PHP', 57.5), /non-negative/);
  assert.throws(() => convertMinorAmount(100, 'EUR', 'PHP', 57.5), /Only PHP and USD/);
  assert.throws(() => convertMinorAmount(100, 'USD', 'PHP', 0), /positive number/);
});
