// E4 — improvement finds what holds across tasks: five similar tasks, each looked back on, then an improvement
// session, then two more similar tasks to see whether the change paid. Until the harness writes retrospectives on its
// own (E3), each task asks for one.

import { calls, check, IMPROVE, testsPass, withRetrospective } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const task = (fn: string, what: string) => withRetrospective(`Add a function ${fn} to src/cart.js that ${what}, with tests. Make sure all tests pass.`);
const before = [1, 2, 3, 4, 5];
const after = [7, 8];
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

const scenario: Scenario = {
  id: 'E4',
  title: 'improvement finds what holds across tasks',
  intents: ['I1', 'I3', 'I5'],
  project: 'cart',
  minutes: 20,
  steps: [
    task('itemCount(items)', 'returns the total quantity of all items'),
    task('cheapest(items)', 'returns the item with the lowest price (undefined for an empty cart)'),
    task('mostExpensive(items)', 'returns the item with the highest price (undefined for an empty cart)'),
    task('averagePrice(items)', 'returns the average unit price in cents, rounded (0 for an empty cart)'),
    task('isEmpty(items)', 'says whether the cart has no items'),
    IMPROVE,
    task('priceRange(items)', 'returns { min, max } of the unit prices (undefined for an empty cart)'),
    task('countAbove(items, cents)', 'returns how many items cost more than the given price per unit'),
  ],
  async check(run) {
    const from = run.records(6)[0]?.version; // where improvement started, after anything the last task left
    const to = run.records(7)[0]?.version;
    const diff = from && to ? run.diff(from, to) : '';
    // Small means not an overhaul: few places touched and little of what was there taken out. A new tool of a hundred
    // lines is one small step; rewriting the harness is not.
    const added = diff.split('\n').filter((line) => /^\+(?!\+\+)/.test(line)).length;
    const removed = diff.split('\n').filter((line) => /^-(?!--)/.test(line)).length;
    const files = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]);
    const { answers, why } = await run.ask({
      pattern: 'Does the explanation point to something that happened in several of the earlier task sessions, not just one?',
      expects: 'Does it say what it expects the change to improve?',
    }, run.reply(6));
    const [early, late] = [before.map((n) => calls(run.records(n))), after.map((n) => calls(run.records(n)))];
    return [
      check('improvement changed the harness', Boolean(diff), files.join(', ') || 'nothing'),
      check('in a small step, not an overhaul', Boolean(diff) && files.length <= 3 && removed <= 30, `${files.length} files, +${added} −${removed} lines`),
      check('for a pattern across several tasks', answers.pattern, why),
      check('saying what it expects', answers.expects),
      testsPass(run),
      check('the next tasks take fewer turns', mean(late) <= mean(early) * 0.85, `${mean(early).toFixed(1)} → ${mean(late).toFixed(1)} model calls per task (${early.join(', ')} → ${late.join(', ')})`),
    ];
  },
};

export default scenario;
