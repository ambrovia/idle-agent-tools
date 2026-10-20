// E1 — an empty harness does real work.

import { check, testsPass } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const scenario: Scenario = {
  id: 'E1',
  title: 'empty harness does real work',
  intents: ['I6'],
  project: 'cart-buggy',
  steps: ['The tests in this project fail. Find out why, fix the code (not the tests), and run the tests again to confirm.'],
  check(run) {
    const changed = run.sh('git status --porcelain').out.trim();
    return [
      testsPass(run),
      check('no test file changed', !/\btest\//.test(changed), changed.replace(/\n/g, ', ')),
      check('the base never had to take over', !run.records(1).some((entry) => entry.threw)),
    ];
  },
};

export default scenario;
