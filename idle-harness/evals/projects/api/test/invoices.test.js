import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { invoices } from '../src/resources/invoices/store.js';

beforeEach(() => invoices.clear());

test('a invoice can be created, read, changed and deleted', () => {
  const created = handle({ method: 'POST', path: '/invoices', body: { orderId: 'some orderId', amountCents: 1200, dueOn: '2026-07-01' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, 'inv_1');
  assert.equal(handle({ method: 'GET', path: '/invoices/inv_1' }).body.data.id, 'inv_1');
  assert.equal(handle({ method: 'GET', path: '/invoices' }).body.data.length, 1);
  assert.equal(handle({ method: 'PATCH', path: '/invoices/inv_1', body: { orderId: 'some orderId' } }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/invoices/inv_1' }).status, 200);
  assert.equal(handle({ method: 'GET', path: '/invoices/inv_1' }).status, 404);
});

test('a invoice without its required fields is refused', () => {
  const refused = handle({ method: 'POST', path: '/invoices', body: {} });
  assert.equal(refused.status, 400);
  assert.ok(refused.body.details.length > 0);
});
