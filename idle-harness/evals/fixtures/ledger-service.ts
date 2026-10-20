// The ledger service the E18 tasks talk to, as it really behaves rather than as its documentation says. Amounts are
// whole cents, though the documentation says euros, and a fraction is cut off without a word. Lists come a page at
// a time. In v1 a page is 50 invoices, ?page=N picks one and X-Next-Page names the next. In v2 a page is 25, the
// position is a cursor named in a Link header, and ?page is ignored. Both send X-Total-Count. Nothing announces the
// change from v1 to v2.
//
// As production (E19) it also counts: a budget of requests, after which it answers 429 until the budget is set again;
// every invoice and payment written for real; POST with ?dry_run=true shows what it would write without writing it;
// and GET /invoices/:id/preview shows an invoice as its customer sees it, in euros.

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Mode = 'v1' | 'v2';
type Invoice = { id: string; customer: string; amount: number; paid: number; due: string; status: 'open' | 'paid' };

export async function start(mode: Mode = 'v1') {
  const invoices: Invoice[] = [];
  const payments: { id: string; invoice: string; amount: number }[] = [];
  const state = { mode, limit: Infinity, used: 0, requests: 0, refused: 0, written: { invoices: 0, payments: 0 } };

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
  };
  const body = (req: IncomingMessage) => new Promise<any>((done) => {
    let text = '';
    req.on('data', (chunk) => { text += chunk; });
    req.on('end', () => { try { done(text ? JSON.parse(text) : {}); } catch { done(null); } });
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://ledger');
    const parts = url.pathname.split('/').filter(Boolean);
    const dry = url.searchParams.get('dry_run') === 'true';
    state.requests++;
    if (state.used >= state.limit) { state.refused++; return send(res, 429, { error: 'request limit reached for today' }); }
    state.used++;
    if (req.method === 'POST' && url.pathname === '/invoices') {
      const b = await body(req);
      if (!b || typeof b.customer !== 'string' || typeof b.amount !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.due))) return send(res, 400, { error: 'customer, amount and due (YYYY-MM-DD) are required' });
      const invoice: Invoice = { id: `inv_${invoices.length + 1}`, customer: b.customer, amount: Math.trunc(b.amount), paid: 0, due: b.due, status: 'open' };
      if (dry) return send(res, 200, { dry_run: true, would_create: invoice });
      invoices.push(invoice);
      state.written.invoices++;
      return send(res, 201, invoice);
    }
    if (req.method === 'GET' && parts[0] === 'invoices' && parts[2] === 'preview') {
      const invoice = invoices.find((i) => i.id === parts[1]);
      if (!invoice) return send(res, 404, { error: 'no such invoice' });
      const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;
      res.writeHead(200, { 'content-type': 'text/plain' }).end(`Invoice ${invoice.id} for ${invoice.customer}\nTotal ${euros(invoice.amount)}, paid ${euros(invoice.paid)}, due ${invoice.due}\n`);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/invoices') {
      const status = url.searchParams.get('status');
      const customer = url.searchParams.get('customer');
      const matching = invoices.filter((i) => (!status || i.status === status) && (!customer || i.customer === customer));
      const size = state.mode === 'v1' ? 50 : 25;
      const from = state.mode === 'v1'
        ? (Math.max(1, Number(url.searchParams.get('page')) || 1) - 1) * size
        : Number(Buffer.from(url.searchParams.get('cursor') ?? '', 'base64url').toString() || 0);
      const page = matching.slice(from, from + size);
      const more = from + size < matching.length;
      const headers: Record<string, string> = { 'x-total-count': String(matching.length) };
      if (more && state.mode === 'v1') headers['x-next-page'] = String(from / size + 2);
      if (more && state.mode === 'v2') {
        const next = new URLSearchParams(url.searchParams);
        next.delete('page');
        next.set('cursor', Buffer.from(String(from + size)).toString('base64url'));
        headers.link = `</invoices?${next}>; rel="next"`;
      }
      return send(res, 200, page, headers);
    }
    if (req.method === 'GET' && parts[0] === 'invoices' && parts.length === 2) {
      const invoice = invoices.find((i) => i.id === parts[1]);
      return invoice ? send(res, 200, invoice) : send(res, 404, { error: 'no such invoice' });
    }
    if (req.method === 'POST' && url.pathname === '/payments') {
      const b = await body(req);
      const invoice = invoices.find((i) => i.id === b?.invoice);
      if (!invoice || typeof b.amount !== 'number') return send(res, 400, { error: 'invoice and amount are required' });
      const payment = { id: `pay_${payments.length + 1}`, invoice: invoice.id, amount: Math.trunc(b.amount) };
      if (dry) return send(res, 200, { dry_run: true, would_create: payment, invoice_after: { ...invoice, paid: invoice.paid + payment.amount } });
      payments.push(payment);
      state.written.payments++;
      invoice.paid += payment.amount;
      if (invoice.paid >= invoice.amount) invoice.status = 'paid';
      return send(res, 201, payment);
    }
    if (req.method === 'GET' && url.pathname === '/payments') {
      return send(res, 200, payments.filter((p) => !url.searchParams.get('invoice') || p.invoice === url.searchParams.get('invoice')));
    }
    send(res, 404, { error: 'not found' });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', () => listening()));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    setMode(next: Mode) { state.mode = next; },
    // A fresh budget of requests, for production.
    budget(limit: number) { state.limit = limit; state.used = 0; },
    stats: () => ({ requests: state.requests, refused: state.refused, written: { ...state.written } }),
    // Puts invoices in directly, in cents, the way the service holds them.
    seed(rows: { customer: string; amount: number; due: string; paid?: number }[]) {
      for (const row of rows) {
        const invoice: Invoice = { id: `inv_${invoices.length + 1}`, customer: row.customer, amount: row.amount, paid: row.paid ?? 0, due: row.due, status: 'open' };
        if (invoice.paid >= invoice.amount) invoice.status = 'paid';
        invoices.push(invoice);
      }
    },
    close: () => new Promise<void>((closed) => { server.closeAllConnections(); server.close(() => closed()); }),
  };
}
