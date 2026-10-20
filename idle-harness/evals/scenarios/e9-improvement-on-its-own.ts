// E9 — improvement comes on its own. A stream of tasks, and nobody starts an improvement session: one has to appear
// by itself. Until the harness has a trigger, this fails.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, withRetrospective } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const task = (fn: string, what: string) => withRetrospective(`Add a function ${fn} to src/cart.js that ${what}, with tests. Make sure all tests pass.`);

const scenario: Scenario = {
  id: 'E9',
  title: 'improvement comes on its own',
  intents: ['I3', 'I7'],
  project: 'cart',
  steps: [
    task('itemCount(items)', 'returns the total quantity of all items'),
    task('cheapest(items)', 'returns the item with the lowest price (undefined for an empty cart)'),
    task('isEmpty(items)', 'says whether the cart has no items'),
  ],
  check(run) {
    let sessions: string[] = [];
    try { sessions = readdirSync(join(run.harness, '.sessions')); } catch { /* none */ }
    const started = new Set([...run.sessions.keys()].map((n) => `s${n}`));
    const own = sessions.filter((session) => !started.has(session));
    return [check('an improvement session ran without anyone starting it', own.length > 0, own.length ? own.join(', ') : 'only the sessions the eval started')];
  },
};

export default scenario;
