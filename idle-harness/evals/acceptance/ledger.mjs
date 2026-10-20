// What the ledger tasks asked for, checked against a fresh ledger service in the mode it is in now (LEDGER_MODE),
// where the harness cannot see it. Every test puts in more invoices than fit on a page. Run with PROJECT set to the
// project copy.

import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { start } = await import(new URL('../fixtures/ledger-service.ts', import.meta.url).href);
const client = await import(pathToFileURL(join(process.env.PROJECT, 'src', 'client.js')).href);

// A fresh service for one test, which the client is pointed at.
async function fresh(rows = []) {
  const service = await start(process.env.LEDGER_MODE || 'v1');
  process.env.LEDGER_URL = service.url;
  service.seed(rows);
  return service;
}
const raw = async (service, path) => (await fetch(`${service.url}${path}`)).json();
// n invoices for a customer, with amounts in cents that do not end in 00.
const many = (customer, n, { paid = () => 0, due = () => '2026-07-01', amount = (i) => 1000 + i * 37 } = {}) =>
  Array.from({ length: n }, (_, i) => ({ customer, amount: amount(i), paid: paid(i, amount(i)), due: due(i) }));
const around = (value, expected) => assert.ok(Math.abs(value - expected) < 0.005, `${value} is not ${expected}`);

test('createInvoice', async () => {
  const service = await fresh();
  try {
    const id = await client.createInvoice('acme', 12.5, '2026-07-01');
    const stored = await raw(service, `/invoices/${id}`);
    assert.equal(stored.amount, 1250, 'the service holds cents');
    assert.equal(stored.customer, 'acme');
  } finally { await service.close(); }
});

test('getInvoice', async () => {
  const service = await fresh([{ customer: 'getco', amount: 1999, paid: 500, due: '2026-07-03' }]);
  try {
    const invoice = await client.getInvoice('inv_1');
    around(invoice.euros, 19.99);
    around(invoice.paid, 5);
    assert.equal(invoice.customer, 'getco');
    assert.equal(invoice.status, 'open');
  } finally { await service.close(); }
});

test('listInvoices', async () => {
  const service = await fresh([...many('many', 130, { paid: (i, a) => (i % 3 === 0 ? a : 0) }), ...many('other', 10)]);
  try {
    assert.equal((await client.listInvoices({ customer: 'many' })).length, 130);
    assert.equal((await client.listInvoices({ customer: 'many', status: 'open' })).length, 86);
    assert.equal((await client.listInvoices()).length, 140);
    around((await client.listInvoices({ customer: 'other' }))[0].euros, 10);
  } finally { await service.close(); }
});

test('recordPayment', async () => {
  const service = await fresh([{ customer: 'payco', amount: 5000, due: '2026-07-01' }]);
  try {
    const after = await client.recordPayment('inv_1', 20);
    around(after.paid, 20);
    assert.equal(after.status, 'open');
    assert.equal((await client.recordPayment('inv_1', 30)).status, 'paid');
    assert.equal((await raw(service, '/invoices/inv_1')).paid, 5000);
  } finally { await service.close(); }
});

test('outstanding', async () => {
  const rows = [...many('owing', 70, { paid: (i, a) => (i % 4 === 0 ? a : i % 4 === 1 ? 333 : 0) }), ...many('else', 40)];
  const service = await fresh(rows);
  try {
    const owed = (customer) => rows.filter((r) => (!customer || r.customer === customer) && r.paid < r.amount).reduce((t, r) => t + r.amount - r.paid, 0) / 100;
    around(await client.outstanding('owing'), owed('owing'));
    around(await client.outstanding(), owed());
  } finally { await service.close(); }
});

test('overdue', async () => {
  const rows = many('late', 90, { due: (i) => (i % 2 ? '2026-07-20' : '2026-07-10'), paid: (i, a) => (i % 5 === 0 ? a : 0) });
  const service = await fresh(rows);
  try {
    const want = rows.map((r, i) => ({ ...r, id: `inv_${i + 1}` })).filter((r) => r.due < '2026-07-15' && r.paid < r.amount).map((r) => r.id).sort();
    assert.deepEqual([...(await client.overdue('2026-07-15'))].sort(), want);
  } finally { await service.close(); }
});

test('customersOwing', async () => {
  const names = ['zeta', 'alpha', 'mid', 'paidup'];
  const rows = Array.from({ length: 80 }, (_, i) => ({ customer: names[i % 4], amount: 1000 + i, paid: names[i % 4] === 'paidup' ? 1000 + i : 0, due: '2026-07-01' }));
  const service = await fresh(rows);
  try {
    assert.deepEqual(await client.customersOwing(), ['alpha', 'mid', 'zeta']);
  } finally { await service.close(); }
});

test('paidShare', async () => {
  const rows = many('share', 60, { paid: (i, a) => (i % 3 === 0 ? a : i % 3 === 1 ? Math.floor(a / 2) : 0) });
  const service = await fresh(rows);
  try {
    const share = Math.round((1000 * rows.reduce((t, r) => t + r.paid, 0)) / rows.reduce((t, r) => t + r.amount, 0)) / 10;
    around(await client.paidShare('share'), share);
  } finally { await service.close(); }
});

test('payAll', async () => {
  const rows = [...many('payer', 55, { paid: (i, a) => (i % 5 === 0 ? a : i % 5 === 1 ? 100 : 0) }), ...many('bystander', 5)];
  const service = await fresh(rows);
  try {
    assert.equal(await client.payAll('payer'), 44);
    const left = (await raw(service, '/invoices?customer=payer&status=open')).length;
    assert.equal(left, 0, 'every invoice of the customer is paid');
    assert.equal((await raw(service, '/invoices?customer=bystander&status=open')).length, 5);
  } finally { await service.close(); }
});

test('largestInvoice', async () => {
  const rows = many('big', 80, { amount: (i) => (i === 67 ? 999999 : 1000 + i), paid: (i, a) => (i === 70 ? a : 0) });
  rows[70].amount = 2000000;
  rows[70].paid = 2000000;
  const service = await fresh(rows);
  try {
    assert.equal(await client.largestInvoice('open'), 'inv_68');
    assert.equal(await client.largestInvoice(), 'inv_71');
  } finally { await service.close(); }
});
