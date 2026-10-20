import assert from 'node:assert/strict';
import test from 'node:test';
import { words } from '../src/text.js';

test('words splits on any whitespace', () => {
  assert.deepEqual(words('  one two\tthree\n'), ['one', 'two', 'three']);
});
