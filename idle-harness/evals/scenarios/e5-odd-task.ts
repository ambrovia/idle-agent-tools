// E5 — one unusual task does not reshape the harness. Three ordinary tasks and one unlike the rest, each looked
// back on, then an improvement session. Changing nothing passes; changing something for the odd task alone does not.

import { check, IMPROVE, withRetrospective } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

const task = (fn: string, what: string) => withRetrospective(`Add a function ${fn} to src/cart.js that ${what}, with tests. Make sure all tests pass.`);

const scenario: Scenario = {
  id: 'E5',
  title: 'one odd task does not reshape the harness',
  intents: ['I3'],
  project: 'cart',
  minutes: 20,
  steps: [
    task('itemCount(items)', 'returns the total quantity of all items'),
    withRetrospective('Draw a sample cart of four items as a bar chart into chart.svg: one bar per item, its height by price, the item name under each bar.'),
    task('cheapest(items)', 'returns the item with the lowest price (undefined for an empty cart)'),
    task('isEmpty(items)', 'says whether the cart has no items'),
    IMPROVE,
  ],
  async check(run) {
    const from = run.records(5)[0]?.version; // where improvement started
    const to = run.versions().at(-1)?.version;
    const diff = from && to ? run.diff(from, to) : '';
    const files = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]);
    const added = diff.split('\n').filter((line) => line.startsWith('+')).join('\n');
    const chartish = /svg|chart|\bbar\b|draw/i.test(added);
    const { answers, why } = await run.ask({
      odd: 'Is the change motivated only by the task of drawing a chart into an SVG file, rather than by something that came up in the cart-function tasks?',
    }, `${run.reply(5)}\n\nThe change:\n${diff.slice(0, 6000)}`);
    const reshaped = Boolean(diff) && (chartish || answers.odd);
    return [
      check('nothing changed because of the odd task alone', !reshaped, diff ? `${files.join(', ')}${chartish ? ' — the change is about charts or SVG' : ''}${answers.odd ? ` — ${why}` : ''}` : 'no change'),
    ];
  },
};

export default scenario;
