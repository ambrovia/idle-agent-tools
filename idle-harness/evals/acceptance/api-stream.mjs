// What the tasks of the api stream asked for, checked through the app where the harness cannot see it. Only what a
// task said in so many words is checked. Run with PROJECT set to the project copy.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { handle } = await import(pathToFileURL(join(process.env.PROJECT, 'src', 'app.js')).href);
const post = (path, body) => handle({ method: 'POST', path, body });
const list = (path, query) => handle({ method: 'GET', path, query }).body.data;
const id = (answer, prefix) => { assert.equal(answer.status, 201, JSON.stringify(answer.body)); assert.match(answer.body.data.id, new RegExp(`^${prefix}_\\d+$`)); return answer.body.data.id; };
const documented = (name) => existsSync(join(process.env.PROJECT, 'docs', `${name}.md`)) && readFileSync(join(process.env.PROJECT, 'docs', 'README.md'), 'utf8').includes(`${name}.md`);

test('categories', () => {
  const tools = id(post('/categories', { name: 'Tools' }), 'cat');
  assert.equal(handle({ method: 'GET', path: `/categories/${tools}` }).body.data.name, 'Tools');
  id(post('/categories', { name: 'Saws', parentId: tools }), 'cat');
  assert.equal(post('/categories', {}).status, 400);
  assert.ok(documented('categories'));
});

test('products take an optional weightGrams', () => {
  assert.equal(post('/products', { sku: 'W-1', title: 'Weighed', priceCents: 100, weightGrams: 250 }).body.data.weightGrams, 250);
  assert.equal(post('/products', { sku: 'W-2', title: 'Heavy', priceCents: 100, weightGrams: 'heavy' }).status, 400);
  assert.equal(post('/products', { sku: 'W-3', title: 'Unweighed', priceCents: 100 }).status, 201);
});

test('coupons', () => {
  id(post('/coupons', { code: 'SAVE10', percentOff: 10 }), 'cpn');
  id(post('/coupons', { code: 'SAVE20', percentOff: 20, expiresOn: '2026-12-31' }), 'cpn');
  assert.equal(post('/coupons', { code: 'SOON', percentOff: 5, expiresOn: 'soon' }).status, 400);
  assert.equal(post('/coupons', { code: 'NONE' }).status, 400);
  assert.ok(documented('coupons'));
});

test('orders can be listed by status', () => {
  const open = post('/orders', { userId: 'usr_1', totalCents: 100, status: 'open' }).body.data.id;
  const paid = post('/orders', { userId: 'usr_1', totalCents: 200, status: 'paid' }).body.data.id;
  const found = list('/orders', { status: 'paid' }).map((order) => order.id);
  assert.ok(found.includes(paid) && !found.includes(open));
});

test('reviews take a rating from 1 to 5', () => {
  id(post('/reviews', { productId: 'prd_1', rating: 5 }), 'rev');
  id(post('/reviews', { productId: 'prd_1', rating: 1, text: 'meh' }), 'rev');
  for (const rating of [0, 6, 3.5]) assert.equal(post('/reviews', { productId: 'prd_1', rating }).status, 400, `rating ${rating}`);
  assert.ok(documented('reviews'));
});

test('shipments', () => {
  id(post('/shipments', { orderId: 'ord_1', carrier: 'dhl' }), 'shp');
  id(post('/shipments', { orderId: 'ord_1', carrier: 'dpd', shippedOn: '2026-07-02' }), 'shp');
  assert.equal(post('/shipments', { orderId: 'ord_1', carrier: 'fedex' }).status, 400);
  assert.ok(documented('shipments'));
});

test('users can be owners', () => {
  assert.equal(post('/users', { email: 'o@example.com', name: 'O', role: 'owner' }).body.data.role, 'owner');
  assert.equal(post('/users', { email: 'b@example.com', name: 'B', role: 'boss' }).status, 400);
});

test('returns', () => {
  id(post('/returns', { orderId: 'ord_1', reason: 'broken' }), 'ret');
  id(post('/returns', { orderId: 'ord_1', reason: 'late', refundCents: 500 }), 'ret');
  assert.equal(post('/returns', { orderId: 'ord_1' }).status, 400);
  assert.ok(documented('returns'));
});

test('suppliers can be listed by country', () => {
  const de = post('/suppliers', { name: 'Hans', country: 'DE' }).body.data.id;
  const fr = post('/suppliers', { name: 'Jean', country: 'FR' }).body.data.id;
  const found = list('/suppliers', { country: 'DE' }).map((supplier) => supplier.id);
  assert.ok(found.includes(de) && !found.includes(fr));
});

test('employees', () => {
  id(post('/employees', { name: 'Eve', email: 'eve@example.com' }), 'emp');
  id(post('/employees', { name: 'Max', email: 'max@example.com', warehouseId: 'wrh_1' }), 'emp');
  assert.equal(post('/employees', { name: 'No mail' }).status, 400);
  assert.ok(documented('employees'));
});

test('warehouses need a country', () => {
  assert.equal(post('/warehouses', { code: 'W1', city: 'Berlin' }).status, 400);
  assert.equal(post('/warehouses', { code: 'W2', city: 'Berlin', country: 'DE' }).status, 201);
});

test('carts', () => {
  id(post('/carts', { userId: 'usr_1' }), 'crt');
  id(post('/carts', { userId: 'usr_1', currency: 'EUR' }), 'crt');
  assert.equal(post('/carts', { userId: 'usr_1', currency: 'GBP' }).status, 400);
  assert.ok(documented('carts'));
});
