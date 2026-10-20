// E11 — a change travels: a tool one harness made for itself is taken up by a second harness on its own work.
// For now the eval copies the tool across; how harnesses would hand changes to each other is not built.

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, testsPass } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const tools = (dir: string) => (existsSync(join(dir, 'tools')) ? readdirSync(join(dir, 'tools')).filter((file) => file.endsWith('.ts')).map((file) => file.slice(0, -3)) : []);

const scenario: Scenario = {
  id: 'E11',
  title: 'a change travels',
  intents: ['I5', 'I8'],
  project: 'cart',
  steps: [
    'Give yourself a tool that runs this project\'s tests and reports how many passed and failed, then use it to confirm that they pass.',
    (run) => {
      if (!existsSync(join(run.own(1), 'tools'))) return;
      mkdirSync(run.dir('b'), { recursive: true });
      cpSync(join(run.own(1), 'tools'), join(run.dir('b'), 'tools'), { recursive: true });
    },
    { message: 'Add a function isEmpty(items) to src/cart.js that says whether the cart has no items, with a test. Make sure all tests pass.', harness: 'b' },
  ],
  check(run) {
    const made = tools(run.own(1));
    const used = run.records(2).flatMap((entry) => entry.calls ?? []).filter((call: any) => call.block === 'tool' && made.includes(call.call.function.name));
    const worked = used.filter((call: any) => !String(call.result).startsWith('error'));
    return [
      check('the first harness made itself a tool', made.length > 0, made.join(', ') || 'none'),
      check('the second harness used it on its own work', used.length > 0, used.length ? `${used.length} calls` : 'never called it'),
      check('without it failing', used.length > 0 && worked.length === used.length, used.map((call: any) => String(call.result).slice(0, 80)).join(' | ')),
      testsPass(run),
    ];
  },
};

export default scenario;
