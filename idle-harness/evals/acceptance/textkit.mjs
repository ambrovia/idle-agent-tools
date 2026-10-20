// What the textkit tasks asked for, checked where the harness cannot see it. Run with PROJECT set to the project copy.

import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const text = await import(pathToFileURL(join(process.env.PROJECT, 'src', 'text.js')).href);

test('capitalize upper-cases the first letter of every word', () => {
  assert.equal(text.capitalize('hello big world'), 'Hello Big World');
});

test('truncate shortens long text to the length, ending in an ellipsis that counts', () => {
  assert.equal(text.truncate('abcdef', 4), 'abc…');
  assert.equal(text.truncate('abc', 4), 'abc');
});

test('wordCount counts words, 0 for blank text', () => {
  assert.equal(text.wordCount('  a b  c '), 3);
  assert.equal(text.wordCount('   '), 0);
});
