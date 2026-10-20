import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { warehouses } from '../src/resources/warehouses/store.js';

beforeEach(() => warehouses.clear());

test('a warehouse can be created, read, changed and deleted', () => {
  const created = handle({ method: 'POST', path: '/warehouses', body: { code: 'some code', city: 'some city' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, 'wrh_1');
  assert.equal(handle({ method: 'GET', path: '/warehouses/wrh_1' }).body.data.id, 'wrh_1');
  assert.equal(handle({ method: 'GET', path: '/warehouses' }).body.data.length, 1);
  assert.equal(handle({ method: 'PATCH', path: '/warehouses/wrh_1', body: { code: 'some code' } }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/warehouses/wrh_1' }).status, 200);
  assert.equal(handle({ method: 'GET', path: '/warehouses/wrh_1' }).status, 404);
});

test('a warehouse without its required fields is refused', () => {
  const refused = handle({ method: 'POST', path: '/warehouses', body: {} });
  assert.equal(refused.status, 400);
  assert.ok(refused.body.details.length > 0);
});
