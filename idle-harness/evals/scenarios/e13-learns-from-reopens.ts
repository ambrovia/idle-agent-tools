// E13 — a harness learns what the requester wants from the tasks they reopen. The stream of E12, in a project whose
// CHANGELOG.md lists every change under "## Unreleased". No task says so. A task whose change is missing from it is
// reopened once in the same session, as a requester would. The question is when the reopenings stop, and where the
// harness keeps what it learned: in a working session the moment it was told, or at improvement.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accepts, calls, check, testsPass } from '../scenario.ts';
import type { Run, Scenario, Step } from '../scenario.ts';
import { blocks, STREAM } from './e12-level-of-change.ts';

const REOPEN = 'Reopened by the requester: this change is missing from CHANGELOG.md. Every change gets a line there under "## Unreleased".';

// The function a task is about: the first name called in its message.
const about = (task: string) => task.match(/([A-Za-z]+)\(/)?.[1] ?? '';

// Whether the project's changelog lists the function under Unreleased.
function listed(run: Run, name: string): boolean {
  let log = '';
  try { log = readFileSync(join(run.cwd, 'CHANGELOG.md'), 'utf8'); } catch { return false; }
  const unreleased = log.split(/^## /m).find((section) => /^Unreleased/i.test(section)) ?? '';
  return unreleased.includes(name);
}

const steps: Step[] = STREAM.flatMap((step) => typeof step === 'string'
  ? [step, { reopen: (run: Run) => (listed(run, about(step)) ? null : REOPEN) }]
  : [step]);

const scenario: Scenario = {
  id: 'E13',
  title: 'learns from the tasks the requester reopens',
  intents: ['I1', 'I2', 'I3', 'I7'],
  project: 'cart-changelog',
  minutes: 30,
  steps,
  check(run) {
    const all = blocks(run);
    const reopened = (block: number[]) => block.filter((n) => run.reopened.get(n)).length;
    const last = all.at(-1)!;
    const tasks = all.flat();
    const missing = tasks.map((n, i) => ({ n, name: about(String(STREAM.filter((s) => typeof s === 'string')[i])) })).filter(({ name }) => !listed(run, name));
    const lastReopen = Math.max(0, ...tasks.filter((n) => run.reopened.get(n)));
    return [
      testsPass(run),
      accepts(run, 'cart-stream'),
      check('the last block needs no reopening', reopened(last) === 0, `tasks reopened, block by block: ${all.map((block) => `${reopened(block)} of ${block.length}`).join(' → ')}`),
      check('every change ends up in the changelog', missing.length === 0, missing.length ? `missing: ${missing.map((m) => m.name).join(', ')}` : undefined),
      check('the last task that was reopened', null, lastReopen ? `s${lastReopen}${run.improvements.size ? `; improvement ran in ${[...run.improvements].map((n) => `s${n}`).join(', ')}` : ''}` : 'none'),
      check('model calls per task, block by block', null, all.map((block) => (block.reduce((total, n) => total + calls(run.records(n)), 0) / (block.length || 1)).toFixed(1)).join(' → ')),
    ];
  },
};

export default scenario;
