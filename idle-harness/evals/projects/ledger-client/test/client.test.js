import assert from 'node:assert/strict';
import test from 'node:test';
import { call } from '../src/client.js';

test('the service answers', async () => {
  assert.ok(Array.isArray(await call('GET', '/invoices')));
});
