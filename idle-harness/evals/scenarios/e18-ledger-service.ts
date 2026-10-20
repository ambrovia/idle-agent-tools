// E18 — a service known only from incomplete documentation, which changes without notice. Ten functions for a
// client of a ledger service. The documentation says amounts are euros; the service holds cents and quietly cuts
// fractions off. It says nothing of pages; the service sends 50 invoices at a time and names the next page in a
// header that the project's own helper drops. After the second improvement session the service changes how it pages
// (25 at a time, a cursor in a Link header, ?page ignored), and nothing says so. A session working open loop trusts
// the documentation and gets wrong numbers without an error; one that closes the loop probes the service, reads its
// answers back and checks what it lists against X-Total-Count, so it also notices the change. A function the
// requester finds not working is reopened once. At the end every function is checked against the service as it is
// then, which shows whether earlier functions were mended after the change.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accepts, check, IMPROVE, passing, testsPass, withRetrospective } from '../scenario.ts';
import type { Run, Scenario, Step } from '../scenario.ts';

// The service runs in a process of its own, so that the eval's own waiting on a test never blocks it.
let service: ChildProcess | undefined;

const EUROS = 'Amounts in and out of the client are euros.';
// Each function, and the name of the hidden test that checks it.
export const FUNCTIONS: [string, string][] = [
  [`createInvoice(customer, amount, due) creates an invoice and returns its id. ${EUROS}`, 'createInvoice'],
  [`getInvoice(id) returns the invoice as { id, customer, euros, paid, due, status }, with euros (its amount) and paid in euros.`, 'getInvoice'],
  ['listInvoices({ status, customer } = {}) returns every invoice that matches, each as getInvoice returns it.', 'listInvoices'],
  [`recordPayment(id, amount) pays an amount towards an invoice and returns the invoice as getInvoice does afterwards. ${EUROS}`, 'recordPayment'],
  ['outstanding(customer) returns how many euros are still owed on open invoices, of that customer or, without one, of everyone.', 'outstanding'],
  ["overdue(today) returns the ids of the open invoices due before today, a date as YYYY-MM-DD.", 'overdue'],
  ['customersOwing() returns the names of the customers who still owe anything, sorted.', 'customersOwing'],
  ["paidShare(customer) returns what share of a customer's invoiced euros has been paid, in percent, to one decimal.", 'paidShare'],
  ['payAll(customer) pays every open invoice of a customer in full and returns how many it paid.', 'payAll'],
  ['largestInvoice(status) returns the id of the largest invoice, of that status or, without one, of all.', 'largestInvoice'],
];

const steps: Step[] = [];
FUNCTIONS.forEach(([what, test], i) => {
  steps.push(withRetrospective(`Add to src/client.js: ${what} It talks to the ledger service; docs/API.md describes it. Make sure all tests pass.`));
  steps.push({ reopen: (run) => (passing(run, 'ledger', test) ? null : 'The requester tried it against the ledger service, and it does not do what was asked. Look into it again.') });
  if (i === 2) steps.push(IMPROVE);
  if (i === 5) {
    steps.push(IMPROVE);
    steps.push(() => { service?.stdin?.write('v2\n'); process.env.LEDGER_MODE = 'v2'; }); // the service changes, unannounced
  }
});

const BARE = new Set(['read', 'write', 'edit', 'bash', 'versions']);

const scenario: Scenario = {
  id: 'E18',
  title: 'a service known from incomplete documentation, which changes without notice',
  intents: ['I1', 'I3'],
  project: 'ledger-client',
  minutes: 30,
  async setup(run: Run) {
    process.env.LEDGER_MODE = 'v1';
    service = spawn(process.execPath, [fileURLToPath(new URL('../fixtures/ledger-serve.ts', import.meta.url)), 'v1'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const url = await new Promise<string>((found) => service!.stdout!.once('data', (data) => found(String(data).trim())));
    writeFileSync(join(run.cwd, 'service.json'), `${JSON.stringify({ url })}\n`);
  },
  seed(run) {
    mkdirSync(join(run.harness, 'tools'), { recursive: true });
    writeFileSync(join(run.harness, 'tools', 'ledger.ts'), readFileSync(fileURLToPath(new URL('../fixtures/ledger-tool.ts', import.meta.url)), 'utf8'));
  },
  teardown() {
    service?.kill();
    service = undefined;
  },
  steps,
  check(run) {
    const working = [...run.sessions.keys()].filter((n) => !run.improvements.has(n)).sort((a, b) => a - b);
    const [before, after] = [working.slice(0, 6), working.slice(6)];
    const firstTime = (ns: number[]) => ns.filter((n) => !run.reopened.get(n)).length;
    // Whether a session looked at how the service pages: a call naming its paging headers or the cursor.
    const looked = (n: number) => run.records(n).flatMap((entry) => entry.response?.tool_calls ?? []).some((call: any) => /x-total-count|x-next-page|link|cursor|-i |--include|headers/i.test(String(call.function?.arguments ?? '')));
    const own = (ns: number[]) => ns.reduce((total, n) => total + run.records(n).flatMap((entry) => entry.response?.tool_calls ?? []).filter((call: any) => !BARE.has(call.function?.name)).length, 0);
    const cost = (ns: number[]) => ns.reduce((total, n) => total + run.records(n).reduce((t, entry) => t + (entry.cost ?? 0), 0), 0);
    return [
      testsPass(run),
      accepts(run, 'ledger'),
      check('right the first time, before the change and after', null, `${firstTime(before)} of ${before.length} → ${firstTime(after)} of ${after.length}`),
      check('sessions after the change that looked at how the service pages', null, `${after.filter(looked).length} of ${after.length}`),
      check("calls to the harness's own tools, before the change and after", null, `${own(before)} → ${own(after)}`),
      check('what it cost', null, `$${cost(before).toFixed(4)} before the change, $${cost(after).toFixed(4)} after, $${cost([...run.improvements]).toFixed(4)} on improvement`),
    ];
  },
};

export default scenario;
