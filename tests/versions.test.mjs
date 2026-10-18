// A release bump has to land in every idle-skills manifest at once, or installs keep an old copy.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repo = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => JSON.parse(readFileSync(join(repo, file), 'utf8'));

test('every idle-skills manifest names exactly the version in package.json', () => {
  const { version } = read('package.json');
  for (const file of ['idle-skills/.claude-plugin/plugin.json', 'idle-skills/.codex-plugin/plugin.json', 'idle-skills/.cursor-plugin/plugin.json', 'idle-skills/plugin.json']) {
    assert.equal(read(file).version, version, file);
  }
  assert.equal(read('.cursor-plugin/marketplace.json').metadata.version, version, '.cursor-plugin/marketplace.json');
  assert.equal(readFileSync(join(repo, 'idle-skills/apm.yml'), 'utf8').match(/^version:\s*(\S+)/m)?.[1], version, 'idle-skills/apm.yml');
});
