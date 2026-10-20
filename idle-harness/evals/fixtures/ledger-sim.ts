// A ledger harness's own simulation, as a harness that had learned the production ledger might have formalised it:
// a fake of the service to test against instead of production, and a calibration that compares the fake with what
// production answers to a few read-only requests. Written from what was learned, not from the service's code: when
// production changes, the calibration shows where, and the fake has to be mended to match.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { join } from 'node:path';

export const description = 'A simulation of the production ledger, to try things on instead of production. action "start" runs a fake ledger and returns its URL — point the client at it with LEDGER_URL. It behaves as production was found to: amounts in whole cents (fractions cut off), 50 invoices a page, ?page=N, X-Next-Page and X-Total-Count. action "calibrate" sends a few read-only requests to production and to the fake and lists every difference in how they answer: run it before trusting the fake, and mend this file when they differ. action "stop" ends the fake.';
export const parameters = { type: 'object', properties: { action: { type: 'string', enum: ['start', 'calibrate', 'stop'] } }, required: ['action'] };

let fake: { server: Server; url: string } | undefined;

function serve(): Promise<{ server: Server; url: string }> {
  const invoices: any[] = [];
  const payments: any[] = [];
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', (chunk) => { text += chunk; });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://fake');
      const parts = url.pathname.split('/').filter(Boolean);
      const body = text ? JSON.parse(text) : {};
      const send = (status: number, data: unknown, headers: Record<string, string> = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(data));
      if (req.method === 'POST' && url.pathname === '/invoices') {
        const invoice = { id: `inv_${invoices.length + 1}`, customer: body.customer, amount: Math.trunc(body.amount), paid: 0, due: body.due, status: 'open' };
        invoices.push(invoice);
        return send(201, invoice);
      }
      if (req.method === 'GET' && url.pathname === '/invoices') {
        const matching = invoices.filter((i) => (!url.searchParams.get('status') || i.status === url.searchParams.get('status')) && (!url.searchParams.get('customer') || i.customer === url.searchParams.get('customer')));
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const headers: Record<string, string> = { 'x-total-count': String(matching.length) };
        if (page * 50 < matching.length) headers['x-next-page'] = String(page + 1);
        return send(200, matching.slice((page - 1) * 50, page * 50), headers);
      }
      if (req.method === 'GET' && parts[0] === 'invoices' && parts.length === 2) {
        const invoice = invoices.find((i) => i.id === parts[1]);
        return invoice ? send(200, invoice) : send(404, { error: 'no such invoice' });
      }
      if (req.method === 'POST' && url.pathname === '/payments') {
        const invoice = invoices.find((i) => i.id === body.invoice);
        if (!invoice) return send(400, { error: 'invoice and amount are required' });
        const payment = { id: `pay_${payments.length + 1}`, invoice: invoice.id, amount: Math.trunc(body.amount) };
        payments.push(payment);
        invoice.paid += payment.amount;
        if (invoice.paid >= invoice.amount) invoice.status = 'paid';
        return send(201, payment);
      }
      send(404, { error: 'not found' });
    });
  });
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

// How an answer looks, as far as a client depends on it: status, the headers that matter, and the shape of the body.
async function shape(url: string) {
  const answer = await fetch(url);
  const body = await answer.json().catch(() => null);
  const headers = ['x-total-count', 'x-next-page', 'link'].filter((h) => answer.headers.has(h));
  return { status: answer.status, headers, body: Array.isArray(body) ? `a list of ${body.length}` : typeof body, pageSize: Array.isArray(body) ? body.length : null };
}

export async function run({ action }: { action: string }, base: { cwd: string }) {
  if (action === 'stop') { fake?.server.close(); fake = undefined; return 'stopped'; }
  fake ??= await serve();
  if (action === 'start') return `a fake ledger runs at ${fake.url}`;
  // Calibrate: production holds many invoices, so its first page shows how it pages; the fake is filled to match.
  const production = process.env.LEDGER_URL && !process.env.LEDGER_URL.startsWith(fake.url) ? process.env.LEDGER_URL : JSON.parse(readFileSync(join(base.cwd, 'service.json'), 'utf8')).url;
  const real = await shape(`${production}/invoices`);
  const total = Number((await fetch(`${production}/invoices`)).headers.get('x-total-count')) || 120;
  const have = (await (await fetch(`${fake.url}/invoices`)).headers.get('x-total-count')) ?? '0';
  for (let i = Number(have); i < total; i++) await fetch(`${fake.url}/invoices`, { method: 'POST', body: JSON.stringify({ customer: `c${i % 7}`, amount: 1000 + i, due: '2026-07-01' }) });
  const mine = await shape(`${fake.url}/invoices`);
  const differences = [
    real.status !== mine.status && `status: production ${real.status}, fake ${mine.status}`,
    real.headers.join() !== mine.headers.join() && `paging headers: production sends ${real.headers.join(', ') || 'none'}, the fake ${mine.headers.join(', ') || 'none'}`,
    real.pageSize !== mine.pageSize && `page size: production ${real.pageSize}, fake ${mine.pageSize}`,
    real.body !== mine.body && `body: production ${real.body}, fake ${mine.body}`,
  ].filter(Boolean);
  return differences.length ? `the fake differs from production:\n${differences.join('\n')}` : 'the fake answers like production (2 requests to production spent)';
}
