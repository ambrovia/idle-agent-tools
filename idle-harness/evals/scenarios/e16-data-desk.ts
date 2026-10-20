// E16 — a data desk: a stream of questions about the same export, where specialising can pay. Every question needs
// the same groundwork: the export repeats rows, writes dates three ways, spells countries and statuses several ways
// and gives some prices in cents. A session with only the bare tools rediscovers that each time; a harness that keeps
// what it learned — a tool, a note — can answer in a few calls and get it right. A wrong answer is reopened once, as a
// requester would. Improvement runs after the fifth and the tenth question.
//
// It runs under each structure, and with --seed: the harness starts with the tool a specialised harness might have
// built (fixtures/orders-tool.ts). Seeded and frozen is the ceiling, frozen alone the floor; what a learning harness is
// worth is how much of that gap it closes over the stream, counting what it spent on building.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, QUESTIONS, right } from '../fixtures/orders.ts';
import { calls, check, IMPROVE, withRetrospective } from '../scenario.ts';
import type { Run, Scenario, Step } from '../scenario.ts';

const data = generate();
const BARE = new Set(['read', 'write', 'edit', 'bash', 'versions']);

// The answer a run gave to a question, or undefined.
function given(run: Run, id: string): unknown {
  try { return JSON.parse(readFileSync(join(run.cwd, 'answers', `${id}.json`), 'utf8')).answer; } catch { return undefined; }
}
const correct = (run: Run, id: string) => {
  const question = QUESTIONS.find((q) => q.id === id)!;
  return right(question, given(run, id), question.answer(data.lines));
};

const steps: Step[] = [];
QUESTIONS.forEach((question, i) => {
  steps.push(withRetrospective(`Question ${question.id}: ${question.text} Answer from the data in data/ and write it to answers/${question.id}.json as answers/README.md says.`));
  steps.push({ reopen: (run) => (correct(run, question.id) ? null : `The requester checked your answer in answers/${question.id}.json and it is not right. Look into it again.`) });
  if (i === 4 || i === 9) steps.push(IMPROVE);
});

const scenario: Scenario = {
  id: 'E16',
  title: 'a data desk, where specialising can pay',
  intents: ['I1', 'I3'],
  project: 'orders',
  minutes: 30,
  setup(run) {
    for (const [path, content] of Object.entries(data.files)) {
      mkdirSync(dirname(join(run.cwd, path)), { recursive: true });
      writeFileSync(join(run.cwd, path), content);
    }
  },
  seed(run) {
    mkdirSync(join(run.harness, 'tools'), { recursive: true });
    writeFileSync(join(run.harness, 'tools', 'orders.ts'), readFileSync(fileURLToPath(new URL('../fixtures/orders-tool.ts', import.meta.url)), 'utf8'));
  },
  steps,
  check(run) {
    const working = [...run.sessions.keys()].filter((n) => !run.improvements.has(n)).sort((a, b) => a - b);
    const blocks = [working.slice(0, 5), working.slice(5, 10), working.slice(10)];
    const id = (n: number) => QUESTIONS[working.indexOf(n)].id;
    const cost = (n: number) => run.records(n).reduce((total, entry) => total + (entry.cost ?? 0), 0);
    const mean = (ns: number[], f: (n: number) => number) => ns.reduce((total, n) => total + f(n), 0) / (ns.length || 1);
    const wrong = working.filter((n) => !correct(run, id(n)));
    const firstTime = (block: number[]) => block.filter((n) => !run.reopened.get(n)).length;
    const own = (block: number[]) => block.reduce((total, n) => total + run.records(n).flatMap((entry) => entry.response?.tool_calls ?? []).filter((call: any) => !BARE.has(call.function?.name)).length, 0);
    const improving = [...run.improvements].reduce((total, n) => total + cost(n), 0);
    return [
      check('every answer is right in the end', wrong.length === 0, wrong.length ? `wrong: ${wrong.map(id).join(', ')}` : undefined),
      check('right the first time, block by block', null, blocks.map((b) => `${firstTime(b)} of ${b.length}`).join(' → ')),
      check('model calls and cost per question, block by block', null, blocks.map((b) => `${mean(b, (n) => calls(run.records(n))).toFixed(1)} calls, $${mean(b, cost).toFixed(4)}`).join(' → ')),
      check('what the whole stream cost', null, `$${working.reduce((total, n) => total + cost(n), 0).toFixed(4)} on questions, $${improving.toFixed(4)} on improvement`),
      check("calls to the harness's own tools, block by block", null, blocks.map(own).join(' → ')),
    ];
  },
};

export default scenario;
