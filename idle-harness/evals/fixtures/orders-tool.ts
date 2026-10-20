// A data desk harness's own tool, as a harness that has specialised on this export might have built it: the data
// loaded and cleaned once, and the question asked as code.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const description = 'Answer a question about the shop data in data/. Your code is the body of a function of (lines, customers, products) and returns the answer. lines are the order lines, cleaned: each (order_id, line) once, date as YYYY-MM-DD, price in euros, status as fulfilled, cancelled, refunded or pending, country as its ISO code, with the customer\'s segment and signed_up, the product\'s category, and revenue (quantity × price for fulfilled lines, otherwise 0).';
export const parameters = { type: 'object', properties: { code: { type: 'string', description: 'e.g. return lines.filter((l) => l.date.startsWith("2026-03")).reduce((t, l) => t + l.revenue, 0)' } }, required: ['code'] };

const table = (text: string) => {
  const [head, ...rows] = text.trim().split('\n').map((row) => row.split(','));
  return rows.map((row) => Object.fromEntries(head.map((key, i) => [key, row[i]])));
};
const COUNTRY: Record<string, string> = { germany: 'DE', france: 'FR', netherlands: 'NL', austria: 'AT', italy: 'IT', spain: 'ES' };

export async function run({ code }: { code: string }, base: { cwd: string }) {
  const read = (file: string) => table(readFileSync(join(base.cwd, 'data', file), 'utf8'));
  const customers = read('customers.csv').map((c) => ({ ...c, customer_id: Number(c.customer_id) }));
  const products = read('products.csv');
  const who = new Map(customers.map((c) => [c.customer_id, c]));
  const what = new Map(products.map((p) => [p.sku, p]));
  const seen = new Set<string>();
  const lines = [];
  for (const row of read('orders.csv')) {
    const key = `${row.order_id}/${row.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = row.ordered_at.trim();
    const date = /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? `${raw.slice(6)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}` : raw.slice(0, 10);
    const said = row.status.trim().toLowerCase();
    const status = said === 'shipped' || said === 'delivered' ? 'fulfilled' : said === 'canceled' ? 'cancelled' : said;
    const price = row.price_unit === 'cents' ? Number(row.price) / 100 : Number(row.price);
    const quantity = Number(row.quantity);
    const customer = who.get(Number(row.customer_id));
    const country = COUNTRY[row.country.trim().toLowerCase()] ?? row.country.trim().toUpperCase();
    lines.push({ order_id: Number(row.order_id), line: Number(row.line), date, customer_id: Number(row.customer_id), country, sku: row.sku, quantity, price, status,
      segment: customer?.segment, signed_up: customer?.signed_up, category: what.get(row.sku)?.category, revenue: status === 'fulfilled' ? quantity * price : 0 });
  }
  const answer = new Function('lines', 'customers', 'products', code)(lines, customers, products);
  return JSON.stringify(answer, null, 1).slice(0, 20_000);
}
