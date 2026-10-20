// E6 — improvement notices, from the harness's own records, a change that made it worse, and corrects it.
// The starting turn stamps the current time at the top of the system prompt: a plausible change for a harness to make
// for itself, and one that changes the start of every prompt, so the provider's prompt cache never hits.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheHit, check, costPerCall } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const clock = readFileSync(fileURLToPath(new URL('../fixtures/clock-turn.ts', import.meta.url)), 'utf8');
const money = (value: number | null) => (value === null ? 'none' : `$${value.toFixed(5)}`);
const share = (value: number | null) => (value === null ? 'none' : `${Math.round(value * 100)}%`);

const scenario: Scenario = {
  id: 'E6',
  title: 'improvement corrects a change that made it worse',
  intents: ['I2', 'I3', 'I4'],
  project: 'cart',
  minutes: 30,
  setup(run) {
    mkdirSync(run.harness, { recursive: true });
    writeFileSync(join(run.harness, 'turn.ts'), clock);
  },
  steps: [
    'Add a function itemCount(items) to src/cart.js that returns the total quantity of all items, with a test for it. Make sure all tests pass.',
    'Add a function cheapest(items) to src/cart.js that returns the item with the lowest price (undefined for an empty cart), with tests. Make sure all tests pass.',
    { improve: true, message: 'This session is for improvement, not for a task. Look back over your earlier sessions — their records are in .sessions in your harness folder, one entry per turn with usage and cost — and improve how you work where the evidence across them supports it. Keep the step small, and say what you changed and why.' },
    'Add a function mostExpensive(items) to src/cart.js that returns the item with the highest price (undefined for an empty cart), with tests. Make sure all tests pass.',
  ],
  check(run) {
    const before = run.records(3)[0]?.version; // where improvement started
    const after = run.records(4)[0]?.version;
    const changed = before && after && run.file('turn.ts', before) !== run.file('turn.ts', after);
    const reply = run.reply(3);
    const earlier = [...run.records(1), ...run.records(2)];
    const later = run.records(4);
    const [hitBefore, hitAfter] = [cacheHit(earlier), cacheHit(later)];
    return [
      check('improvement changed or dropped the turn', Boolean(changed), `turn.ts at ${before} → ${after}: ${run.file('turn.ts', after) === null ? 'dropped' : changed ? 'changed' : 'same'}`),
      check('it named the cost evidence: the prompt cache', /cach/i.test(reply) && /cost|\$|price/i.test(reply)),
      // The planted harm is the cache breaking, so the correction shows there; cost per call follows the length of a task.
      check('the cache hits clearly more often in the next task', hitBefore !== null && hitAfter !== null && hitAfter >= hitBefore + 0.15, `${share(hitBefore)} → ${share(hitAfter)} of prompt tokens from cache`),
      check('cost per call, before and after', null, `${money(costPerCall(earlier))} → ${money(costPerCall(later))}`),
    ];
  },
};

export default scenario;
