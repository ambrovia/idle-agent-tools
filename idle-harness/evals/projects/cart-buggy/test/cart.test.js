import assert from 'node:assert/strict';
import test from 'node:test';
import { total, discount } from '../src/cart.js';

test('total sums price times quantity', () => {
  assert.equal(total([{ price: 250, quantity: 2 }, { price: 100, quantity: 1 }]), 600);
});

test('discount takes a percentage off', () => {
  assert.equal(discount(1000, 10), 900);
});
