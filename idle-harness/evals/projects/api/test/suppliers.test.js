import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { suppliers } from '../src/resources/suppliers/store.js';

beforeEach(() => suppliers.clear());

test('a supplier can be created, read, changed and deleted', () => {
  const created = handle({ method: 'POST', path: '/suppliers', body: { name: 'some name', country: 'some country' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, 'sup_1');
  assert.equal(handle({ method: 'GET', path: '/suppliers/sup_1' }).body.data.id, 'sup_1');
  assert.equal(handle({ method: 'GET', path: '/suppliers' }).body.data.length, 1);
  assert.equal(handle({ method: 'PATCH', path: '/suppliers/sup_1', body: { name: 'some name' } }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/suppliers/sup_1' }).status, 200);
  assert.equal(handle({ method: 'GET', path: '/suppliers/sup_1' }).status, 404);
});

test('a supplier without its required fields is refused', () => {
  const refused = handle({ method: 'POST', path: '/suppliers', body: {} });
  assert.equal(refused.status, 400);
  assert.ok(refused.body.details.length > 0);
});
