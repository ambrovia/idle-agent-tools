import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { orders } from '../src/resources/orders/store.js';

beforeEach(() => orders.clear());

test('a order can be created, read, changed and deleted', () => {
  const created = handle({ method: 'POST', path: '/orders', body: { userId: 'some userId', totalCents: 1200 } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, 'ord_1');
  assert.equal(handle({ method: 'GET', path: '/orders/ord_1' }).body.data.id, 'ord_1');
  assert.equal(handle({ method: 'GET', path: '/orders' }).body.data.length, 1);
  assert.equal(handle({ method: 'PATCH', path: '/orders/ord_1', body: { userId: 'some userId' } }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/orders/ord_1' }).status, 200);
  assert.equal(handle({ method: 'GET', path: '/orders/ord_1' }).status, 404);
});

test('a order without its required fields is refused', () => {
  const refused = handle({ method: 'POST', path: '/orders', body: {} });
  assert.equal(refused.status, 400);
  assert.ok(refused.body.details.length > 0);
});
