// E8 — every change to the harness says what it changes and what it should improve. The base saves versions under
// a name of its own ("s1 turn 3"); until a harness can hand it a declaration, this fails.

import { check } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const scenario: Scenario = {
  id: 'E8',
  title: 'every change declares itself',
  intents: ['I5'],
  project: 'cart',
  steps: ['Give yourself a tool that runs this project\'s tests and reports how many passed and failed, then use it to confirm that they pass.'],
  check(run) {
    const changes = run.versions().filter(({ message }) => message !== 'empty');
    const undeclared = changes.filter(({ message }) => /^s\d+ turn \d+$/.test(message));
    return [
      check('the harness changed itself', changes.length > 0, `${changes.length} versions`),
      check('every change states what it changes and what it should improve', changes.length > 0 && !undeclared.length, changes.map(({ version, message }) => `${version} "${message}"`).join(', ')),
    ];
  },
};

export default scenario;
