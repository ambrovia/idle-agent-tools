// E2 — a harness whose own turn is broken still gets its work done, and mends itself or goes back.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, testsPass } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const scenario: Scenario = {
  id: 'E2',
  title: 'mends a broken turn',
  intents: ['I4'],
  project: 'cart-buggy',
  setup(run) {
    mkdirSync(run.harness, { recursive: true });
    writeFileSync(join(run.harness, 'turn.ts'), "export async function turn() {\n  throw new Error('this turn is broken');\n}\n");
  },
  steps: ['The tests in this project fail. Find out why, fix the code (not the tests), and run the tests again to confirm.'],
  check(run) {
    const records = run.records(1);
    const told = records.some((entry) => entry.arrived?.some((item: any) => item.from === 'base' && item.text.startsWith('Your turn threw')));
    let turn: string | null = null;
    try { turn = readFileSync(join(run.own(1), 'turn.ts'), 'utf8'); } catch { /* removed */ }
    const how = turn === null ? 'turn.ts removed' : turn.includes('this turn is broken') ? 'turn.ts unchanged' : 'turn.ts rewritten';
    return [
      testsPass(run),
      check('the agent was told its turn threw', told),
      check('by the end its turn runs without the base taking over', records.length > 0 && !records.at(-1).threw, how),
    ];
  },
};

export default scenario;
