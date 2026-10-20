// E12 — at which level the harness should change: a long stream of ordinary tasks on one project, each looked back
// on, with an improvement session after the first and the second block. Run under each structure (--structure open,
// session, frozen) to compare: working sessions keeping their own changes, only improvement changing what the next
// task starts with, and nothing changing at all. Reported, not passed or failed, apart from the project's tests and
// the eval's hidden ones: the comparison across structures is the finding.

import { accepts, calls, check, harnessWork, IMPROVE, testsPass, withRetrospective } from '../scenario.ts';
import type { Run, Scenario, Step } from '../scenario.ts';

const add = (fn: string, what: string) => withRetrospective(`Add a function ${fn} to src/cart.js that ${what}, with tests. Make sure all tests pass.`);
const change = (what: string) => withRetrospective(`${what} Add tests for it. Make sure all tests pass.`);

const mean = (values: number[]) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);

// The working sessions between improvement sessions, as blocks of session numbers.
export function blocks(run: Run): number[][] {
  const all: number[][] = [[]];
  for (const n of [...run.sessions.keys()].sort((a, b) => a - b)) {
    if (run.improvements.has(n)) all.push([]);
    else all.at(-1)!.push(n);
  }
  // Under frozen there are no improvement sessions: the same tasks, cut where improvement would have been.
  if (all.length === 1) return [all[0].slice(0, 5), all[0].slice(5, 10), all[0].slice(10)];
  return all;
}

// Thirteen ordinary tasks, with improvement after the fifth and the tenth. Other evals reuse it.
export const STREAM: Step[] = [
  add('itemCount(items)', 'returns the total quantity of all items'),
  add('cheapest(items)', 'returns the item with the lowest price (undefined for an empty cart)'),
  change('discount(totalCents, percent) in src/cart.js should throw a RangeError when percent is below 0 or above 100.'),
  add('mostExpensive(items)', 'returns the item with the highest price (undefined for an empty cart)'),
  change('total(items) in src/cart.js should leave out items whose quantity is 0 or less.'),
  IMPROVE,
  add('averagePrice(items)', 'returns the average unit price in cents, rounded (0 for an empty cart)'),
  add('applyCoupon(items, code)', "returns the cart's total after the coupon: SAVE10 takes 10% off, SAVE20 20%, using discount; any other code throws an Error"),
  change('itemCount(items) in src/cart.js should leave out items whose quantity is 0 or less, as total does.'),
  add('priceRange(items)', 'returns { min, max } of the unit prices (undefined for an empty cart)'),
  add('byPrice(items)', 'returns the items sorted by unit price, cheapest first, without changing the array it was given'),
  IMPROVE,
  add('removeItem(items, name)', 'returns a new array without the items of that name'),
  add('mergeCarts(a, b)', 'combines two carts into one, adding up the quantities of items with the same name and price'),
  add('formatCents(cents)', "formats an amount in cents as a string like '12.34'"),
];

const scenario: Scenario = {
  id: 'E12',
  title: 'the level at which the harness changes',
  intents: ['I1', 'I3'],
  project: 'cart',
  minutes: 30,
  steps: STREAM,
  check(run) {
    const [first, second, third] = blocks(run);
    const per = (block: number[], measure: (n: number) => number) => mean(block.map(measure));
    const callsOf = (n: number) => calls(run.records(n));
    const costOf = (n: number) => run.records(n).reduce((total, entry) => total + (entry.cost ?? 0), 0);
    const working = [...run.sessions.keys()].filter((n) => !run.improvements.has(n));
    const work = working.map((n) => harnessWork(run.records(n), run.name));
    const onHarness = work.reduce((total, w) => total + w.calls, 0);
    const toolCalls = work.reduce((total, w) => total + w.of, 0);
    const files = run.files();
    const lines = files.reduce((total, file) => total + (run.file(file)?.split('\n').length ?? 0), 0);
    const madeBy = (improvement: boolean) => [...run.sessions.keys()].filter((n) => run.improvements.has(n) === improvement)
      .reduce((total, n) => total + new Set(run.records(n).map((entry) => entry.version)).size - 1, 0);
    const show = (block: number[]) => `${per(block, callsOf).toFixed(1)} calls, $${per(block, costOf).toFixed(4)}`;
    return [
      testsPass(run),
      accepts(run, 'cart-stream'),
      check('model calls and cost per task, block by block', null, `${show(first)} → ${show(second)} → ${show(third)}`),
      check('working sessions spent on their harness', null, `${onHarness} of ${toolCalls} tool calls (${toolCalls ? Math.round((100 * onHarness) / toolCalls) : 0}%)`),
      check('versions made by working sessions and by improvement', null, `${madeBy(false)} by working sessions, ${madeBy(true)} by improvement`),
      check('the harness at the end', null, files.length ? `${files.length} files, ${lines} lines: ${files.join(', ')}` : 'empty'),
    ];
  },
};

export default scenario;
