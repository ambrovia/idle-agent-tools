// E10 — what the human says afterwards changes what the harness does next, and nothing waits for it. After the first
// task, the human leaves a comment on that task, where a front end would: in its session's inbox. Until a harness
// takes comments in after a session has ended, the later tasks never see it, and this fails.

import { send } from '../../src/record.ts';
import { sessionDir } from '../../src/home.ts';
import { check } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const task = (fn: string, what: string) => `Add a function ${fn} to src/cart.js that ${what}, with tests. Make sure all tests pass.`;
const lines = (text: string) => text.split('\n').filter((line) => line.trim()).length;

const scenario: Scenario = {
  id: 'E10',
  title: "the human's word counts",
  intents: ['I7'],
  project: 'cart',
  steps: [
    task('itemCount(items)', 'returns the total quantity of all items'),
    (run) => send(sessionDir(run.name, 's1'), 'user', 'Your final answers are too long. From now on keep them to three lines at most.'),
    task('cheapest(items)', 'returns the item with the lowest price (undefined for an empty cart)'),
    task('isEmpty(items)', 'says whether the cart has no items'),
  ],
  check(run) {
    const counts = [1, 2, 3].map((n) => lines(run.reply(n)));
    return [check('later answers keep to three lines', counts[1] <= 3 && counts[2] <= 3, `final answers: ${counts.join(', ')} lines`)];
  },
};

export default scenario;
