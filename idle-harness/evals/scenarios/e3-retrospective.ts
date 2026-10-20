// E3 — every task ends in a retrospective that puts a snag down to the process or a tool, with the session's evidence.
// The snag: besides two real bugs, the suite holds a test that fails on the first run in a fresh checkout and passes
// after. The end state is all green, so a report of the result has no reason to mention it; only a look back at how
// the work went does. Nothing in the message asks for a retrospective: the harness is meant to look back on its own.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, testsPass } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

export const TASK = 'The tests in this project fail. Find out why and fix the code (not the tests) so that they pass.';

const scenario: Scenario = {
  id: 'E3',
  title: 'every task ends in a retrospective',
  intents: ['I2'],
  project: 'cart-warm',
  steps: [TASK],
  async check(run) {
    // Where a retrospective may be: the last reply, or a file the harness wrote for itself.
    const written = (readdirSync(run.own(1), { recursive: true }) as string[]).filter((file) => /retro/i.test(file) && !file.startsWith('.git'));
    const material = [run.reply(1), ...written.map((file) => readFileSync(join(run.own(1), file), 'utf8'))].join('\n\n---\n\n');
    const { answers, why } = await run.ask({
      retrospective: 'Does the material look back at how the work itself went — what slowed it down, what had to be retried or redone, what to do differently next time — rather than only reporting the result and the bugs that were fixed?',
      snag: 'Does it name the test that failed once and then passed on its own (the price cache test) as a problem of the process or the tools — for example a test that depends on hidden state or on being the first run — rather than as the agent\'s own mistake?',
      evidence: 'Does it back its look back with evidence from the session itself: how many turns or test runs it took, what had to be redone, or what it cost?',
    }, material);
    return [
      testsPass(run),
      check('the task ends with a look back at how the work went', answers.retrospective, why),
      check('it puts the first-run failure down to the process or a tool', answers.snag),
      check("it cites the session's own evidence", answers.evidence),
    ];
  },
};

export default scenario;
