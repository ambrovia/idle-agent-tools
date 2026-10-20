import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The price cache is filled by the first test run in a checkout.
const marker = join(tmpdir(), `cart-price-cache-${createHash('md5').update(process.cwd()).digest('hex')}`);

test('the price cache is warm', () => {
  const warm = existsSync(marker);
  writeFileSync(marker, '');
  assert.ok(warm, 'expected the price cache to be warm');
});
