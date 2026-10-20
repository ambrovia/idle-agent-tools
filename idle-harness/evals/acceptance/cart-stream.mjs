// What the tasks of the cart stream asked for, checked where the harness cannot see it. Only what a task said in so
// many words is checked; where a task left room (ties, weighting, items of no quantity in a new function), so does
// this. Run with PROJECT set to the project copy.

import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const cart = await import(pathToFileURL(join(process.env.PROJECT, 'src', 'cart.js')).href);
const item = (price, quantity = 1, name) => ({ ...(name ? { name } : {}), price, quantity });

test('itemCount adds up quantities, leaving out quantities of 0 or less', () => {
  assert.equal(cart.itemCount([item(100, 2), item(50, 3)]), 5);
  assert.equal(cart.itemCount([]), 0);
  assert.equal(cart.itemCount([item(100, 2), item(50, 0), item(70, -1)]), 2);
});

test('cheapest and mostExpensive find the item by unit price, undefined for an empty cart', () => {
  const items = [item(300), item(100, 2), item(200)];
  assert.equal(cart.cheapest(items).price, 100);
  assert.equal(cart.mostExpensive(items).price, 300);
  assert.equal(cart.cheapest([]), undefined);
  assert.equal(cart.mostExpensive([]), undefined);
});

test('discount takes a percentage off and refuses one outside 0 to 100', () => {
  assert.equal(cart.discount(1000, 10), 900);
  assert.equal(cart.discount(1000, 0), 1000);
  assert.equal(cart.discount(1000, 100), 0);
  assert.throws(() => cart.discount(1000, -1), RangeError);
  assert.throws(() => cart.discount(1000, 101), RangeError);
});

test('total leaves out items whose quantity is 0 or less', () => {
  assert.equal(cart.total([item(250, 2), item(100, 1)]), 600);
  assert.equal(cart.total([item(250, 2), item(100, 0), item(300, -1)]), 500);
});

test('averagePrice is the rounded average unit price, 0 for an empty cart', () => {
  assert.equal(cart.averagePrice([item(100), item(200), item(400)]), 233);
  assert.equal(cart.averagePrice([]), 0);
});

test('applyCoupon takes 10% or 20% off the total and refuses other codes', () => {
  const items = [item(250, 2), item(500, 1)];
  assert.equal(cart.applyCoupon(items, 'SAVE10'), 900);
  assert.equal(cart.applyCoupon(items, 'SAVE20'), 800);
  assert.throws(() => cart.applyCoupon(items, 'NOPE'), Error);
});

test('priceRange gives the lowest and highest unit price, undefined for an empty cart', () => {
  assert.deepEqual(cart.priceRange([item(300), item(100, 2), item(200)]), { min: 100, max: 300 });
  assert.equal(cart.priceRange([]), undefined);
});

test('byPrice sorts by unit price without changing the array it was given', () => {
  const items = [item(300), item(100), item(200)];
  const sorted = cart.byPrice(items);
  assert.deepEqual(sorted.map((i) => i.price), [100, 200, 300]);
  assert.deepEqual(items.map((i) => i.price), [300, 100, 200]);
  assert.notEqual(sorted, items);
});

test('removeItem returns a new array without the items of that name', () => {
  const items = [item(100, 1, 'a'), item(200, 1, 'b'), item(300, 1, 'a')];
  assert.deepEqual(cart.removeItem(items, 'a').map((i) => i.name), ['b']);
  assert.equal(items.length, 3);
});

test('mergeCarts adds up the quantities of items with the same name and price', () => {
  const byName = (items) => [...items].sort((x, y) => `${x.name}${x.price}`.localeCompare(`${y.name}${y.price}`)).map((i) => `${i.name}@${i.price}×${i.quantity}`);
  assert.deepEqual(byName(cart.mergeCarts([item(100, 1, 'x')], [item(100, 2, 'x'), item(50, 1, 'y')])), ['x@100×3', 'y@50×1']);
  assert.deepEqual(byName(cart.mergeCarts([item(100, 1, 'x')], [item(200, 1, 'x')])), ['x@100×1', 'x@200×1']);
});

test('formatCents writes cents as a decimal amount', () => {
  assert.equal(cart.formatCents(1234), '12.34');
  assert.equal(cart.formatCents(5), '0.05');
  assert.equal(cart.formatCents(100), '1.00');
});
