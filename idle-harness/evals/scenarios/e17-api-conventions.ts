// E17 — a codebase with conventions, where specialising can pay. Twelve changes to a small API: new resources and
// new fields, each to be made the way the project makes every other one, across five or six files. A session with
// only the bare tools has to find out each time where everything goes; a harness that keeps a map or a scaffold can
// go straight to it. A change that does not do what was asked is reopened once. Improvement runs after the fourth
// and the eighth change. With --seed the harness starts with the tool a specialised harness might have built
// (fixtures/api-tool.ts): seeded and frozen is the ceiling, frozen alone the floor.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accepts, calls, check, IMPROVE, passing, testsPass, withRetrospective } from '../scenario.ts';
import type { Scenario, Step } from '../scenario.ts';

const LIKE = 'like the other resources: its routes, tests and docs, listed in docs/README.md.';
const QUERY = 'handle receives the query string as query, e.g.';
// Each change, and the name of the hidden test that checks it.
const CHANGES: [string, string][] = [
  [`Add a resource categories (ids prefixed cat) with the fields name (string, required) and parentId (string, optional), ${LIKE}`, 'categories'],
  ['Products get an optional field weightGrams, an integer.', 'products take an optional weightGrams'],
  [`Add a resource coupons (ids prefixed cpn) with the fields code (string, required), percentOff (integer, required) and expiresOn (a date, optional), ${LIKE}`, 'coupons'],
  [`GET /orders?status=paid lists only the orders with that status; ${QUERY} { status: 'paid' }. Without it, every order is listed.`, 'orders can be listed by status'],
  [`Add a resource reviews (ids prefixed rev) with the fields productId (string, required), rating (an integer from 1 to 5, required; anything else is refused with 400) and text (string, optional), ${LIKE}`, 'reviews take a rating from 1 to 5'],
  [`Add a resource shipments (ids prefixed shp) with the fields orderId (string, required), carrier (one of dhl, ups, dpd; required) and shippedOn (a date, optional), ${LIKE}`, 'shipments'],
  ["A user's role can now also be owner.", 'users can be owners'],
  [`Add a resource returns (ids prefixed ret) with the fields orderId (string, required), reason (string, required) and refundCents (integer, optional), ${LIKE}`, 'returns'],
  [`GET /suppliers?country=DE lists only the suppliers from that country; ${QUERY} { country: 'DE' }. Without it, every supplier is listed.`, 'suppliers can be listed by country'],
  [`Add a resource employees (ids prefixed emp) with the fields name (string, required), email (string, required) and warehouseId (string, optional), ${LIKE}`, 'employees'],
  ['Warehouses now need a country (string, required).', 'warehouses need a country'],
  [`Add a resource carts (ids prefixed crt) with the fields userId (string, required) and currency (one of EUR, USD; optional), ${LIKE}`, 'carts'],
];
const BARE = new Set(['read', 'write', 'edit', 'bash', 'versions']);

const steps: Step[] = [];
CHANGES.forEach(([change, test], i) => {
  steps.push(withRetrospective(`${change} Make sure all tests pass.`));
  steps.push({ reopen: (run) => (passing(run, 'api-stream', test) ? null : 'The requester tried it, and it does not do what was asked. Look into it again.') });
  if (i === 3 || i === 7) steps.push(IMPROVE);
});

const scenario: Scenario = {
  id: 'E17',
  title: 'a codebase with conventions, where specialising can pay',
  intents: ['I1', 'I3'],
  project: 'api',
  minutes: 30,
  seed(run) {
    mkdirSync(join(run.harness, 'tools'), { recursive: true });
    writeFileSync(join(run.harness, 'tools', 'resource.ts'), readFileSync(fileURLToPath(new URL('../fixtures/api-tool.ts', import.meta.url)), 'utf8'));
  },
  steps,
  check(run) {
    const working = [...run.sessions.keys()].filter((n) => !run.improvements.has(n)).sort((a, b) => a - b);
    const blocks = [working.slice(0, 4), working.slice(4, 8), working.slice(8)];
    const cost = (n: number) => run.records(n).reduce((total, entry) => total + (entry.cost ?? 0), 0);
    const mean = (ns: number[], f: (n: number) => number) => ns.reduce((total, n) => total + f(n), 0) / (ns.length || 1);
    const firstTime = (block: number[]) => block.filter((n) => !run.reopened.get(n)).length;
    const own = (block: number[]) => block.reduce((total, n) => total + run.records(n).flatMap((entry) => entry.response?.tool_calls ?? []).filter((call: any) => !BARE.has(call.function?.name)).length, 0);
    const improving = [...run.improvements].reduce((total, n) => total + cost(n), 0);
    return [
      testsPass(run),
      accepts(run, 'api-stream'),
      check('right the first time, block by block', null, blocks.map((b) => `${firstTime(b)} of ${b.length}`).join(' → ')),
      check('model calls and cost per change, block by block', null, blocks.map((b) => `${mean(b, (n) => calls(run.records(n))).toFixed(1)} calls, $${mean(b, cost).toFixed(4)}`).join(' → ')),
      check('what the whole stream cost', null, `$${working.reduce((total, n) => total + cost(n), 0).toFixed(4)} on changes, $${improving.toFixed(4)} on improvement`),
      check("calls to the harness's own tools, block by block", null, blocks.map(own).join(' → ')),
    ];
  },
};

export default scenario;
