import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handle } from '../src/app.js';
import { users } from '../src/resources/users/store.js';

beforeEach(() => users.clear());

test('a user can be created, read, changed and deleted', () => {
  const created = handle({ method: 'POST', path: '/users', body: { email: 'a@example.com', name: 'some name' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, 'usr_1');
  assert.equal(handle({ method: 'GET', path: '/users/usr_1' }).body.data.id, 'usr_1');
  assert.equal(handle({ method: 'GET', path: '/users' }).body.data.length, 1);
  assert.equal(handle({ method: 'PATCH', path: '/users/usr_1', body: { email: 'a@example.com' } }).status, 200);
  assert.equal(handle({ method: 'DELETE', path: '/users/usr_1' }).status, 200);
  assert.equal(handle({ method: 'GET', path: '/users/usr_1' }).status, 404);
});

test('a user without its required fields is refused', () => {
  const refused = handle({ method: 'POST', path: '/users', body: {} });
  assert.equal(refused.status, 400);
  assert.ok(refused.body.details.length > 0);
});
