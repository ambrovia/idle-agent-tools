// E15 — what a harness learned on one project carries to other work, or gets in its way. It works the first five cart
// tasks of E12 and improves; then it takes three tasks in a different project, textkit. A fresh harness of the same run
// takes the same three tasks in a copy of its own. Comparing the two on those tasks shows whether the learning was
// about how to work or about the cart.

import { accepts, calls, check, IMPROVE, withRetrospective } from '../scenario.ts';
import type { Run, Scenario, Step } from '../scenario.ts';
import { STREAM } from './e12-level-of-change.ts';

const TEXTKIT = [
  'Add a function capitalize(text) to src/text.js that upper-cases the first letter of every word, with tests. Make sure all tests pass.',
  "Add a function truncate(text, length) to src/text.js that shortens text longer than length to exactly length characters, the last of them '…'; shorter text comes back as it is. With tests. Make sure all tests pass.",
  'Add a function wordCount(text) to src/text.js that returns the number of words (0 for blank text), with tests. Make sure all tests pass.',
].map(withRetrospective);

const before = STREAM.slice(0, STREAM.indexOf(IMPROVE) + 1);
const steps: Step[] = [
  ...before,
  ...TEXTKIT.map((message) => ({ message, in: 'textkit' })),
  ...TEXTKIT.map((message) => ({ message, harness: 'b', in: 'textkit#b' })),
];

const sessionsIn = (run: Run, place: string) => [...run.where.keys()].filter((n) => run.where.get(n) === run.at(place));
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / (values.length || 1);

const scenario: Scenario = {
  id: 'E15',
  title: 'what it learned carries to other work',
  intents: ['I1', 'I3', 'I5'],
  project: 'cart',
  minutes: 30,
  steps,
  check(run) {
    const [trained, fresh] = [sessionsIn(run, 'textkit'), sessionsIn(run, 'textkit#b')];
    const cost = (n: number) => run.records(n).reduce((total, entry) => total + (entry.cost ?? 0), 0);
    const show = (ns: number[]) => `${mean(ns.map((n) => calls(run.records(n)))).toFixed(1)} calls, $${mean(ns.map(cost)).toFixed(4)}`;
    // What of the cart the trained harness took along: its files at the start of the new work, searched for the cart.
    const start = run.records(trained[0])[0]?.version;
    const carried = run.files(undefined, start).filter((file) => /cart|itemCount|cheapest|discount|total\(|mostExpensive/i.test(run.file(file, start) ?? ''));
    return [
      accepts(run, 'textkit', 'textkit'),
      accepts(run, 'textkit', 'textkit#b'),
      check('the new work, trained harness against fresh', null, `${show(trained)} against ${show(fresh)}`),
      check('files in the trained harness that speak of the cart', null, carried.length ? carried.join(', ') : 'none'),
    ];
  },
};

export default scenario;
