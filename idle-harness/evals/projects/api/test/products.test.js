import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { products } from '../src/resources/products/store.js';

beforeEach(() => products.clear());

test('a product can be created, read, changed and deleted', () => {
  const created = handle({ method: 'POST', path: '/products', body: { sku: 'some sku', title: 'some title', priceCents: 1200 } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, 'prd_1');
  assert.equal(handle({ method: 'GET', path: '/products/prd_1' }).body.data.id, 'prd_1');
  assert.equal(handle({ method: 'GET', path: '/products' }).body.data.length, 1);
  assert.equal(handle({ method: 'PATCH', path: '/products/prd_1', body: { sku: 'some sku' } }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/products/prd_1' }).status, 200);
  assert.equal(handle({ method: 'GET', path: '/products/prd_1' }).status, 404);
});

test('a product without its required fields is refused', () => {
  const refused = handle({ method: 'POST', path: '/products', body: {} });
  assert.equal(refused.status, 400);
  assert.ok(refused.body.details.length > 0);
});
