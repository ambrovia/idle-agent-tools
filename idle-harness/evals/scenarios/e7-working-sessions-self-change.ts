// E7 — how much working sessions change the harness on their own, with no improvement session at all. Reported, not
// passed or failed, until we know whether changes in the middle of a task help or hurt.

import { check, testsPass, withRetrospective } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const task = (fn: string, what: string) => withRetrospective(`Add a function ${fn} to src/cart.js that ${what}, with tests. Make sure all tests pass.`);

const scenario: Scenario = {
  id: 'E7',
  title: 'working sessions leave improvement to improvement',
  intents: ['I3'],
  project: 'cart',
  minutes: 20,
  steps: [
    task('itemCount(items)', 'returns the total quantity of all items'),
    task('cheapest(items)', 'returns the item with the lowest price (undefined for an empty cart)'),
    task('mostExpensive(items)', 'returns the item with the highest price (undefined for an empty cart)'),
    task('averagePrice(items)', 'returns the average unit price in cents, rounded (0 for an empty cart)'),
    task('isEmpty(items)', 'says whether the cart has no items'),
  ],
  check(run) {
    const changes = run.versions().filter(({ message }) => message !== 'empty');
    const bySession = [1, 2, 3, 4, 5].map((n) => new Set(run.records(n).map((entry) => entry.version)).size - 1);
    const files = run.files();
    return [
      testsPass(run),
      check('changes the working sessions made to the harness', null, `${changes.length} versions (${bySession.join(', ')} per session); the folder holds: ${files.join(', ') || 'nothing'}`),
    ];
  },
};

export default scenario;
