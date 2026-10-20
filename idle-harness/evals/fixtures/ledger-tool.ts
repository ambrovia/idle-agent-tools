// A ledger harness's own sensor, as a harness that had learned this service might have formalised it: a call to the
// service that shows everything it answered, and a listing that follows its pages however it pages and says whether
// it got everything.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const description = 'Look at the ledger service directly, past the client and its documentation. method and path call it once and show the status, every header and the body. With all: true on a GET of a list it follows the pages — X-Next-Page or a Link rel="next", whichever the service sends — and checks the count against X-Total-Count. Use it to find out how the service really behaves (units, pages, errors), and to check what the client returns against it.';
export const parameters = {
  type: 'object',
  properties: { method: { type: 'string' }, path: { type: 'string' }, body: { type: 'object' }, all: { type: 'boolean' } },
  required: ['method', 'path'],
};

export async function run({ method, path, body, all }: { method: string; path: string; body?: object; all?: boolean }, base: { cwd: string }) {
  const url = process.env.LEDGER_URL || JSON.parse(readFileSync(join(base.cwd, 'service.json'), 'utf8')).url;
  const call = async (p: string) => {
    const answer = await fetch(`${url}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: answer.status, headers: Object.fromEntries(answer.headers), body: await answer.json().catch(() => null) };
  };
  if (!all) return JSON.stringify(await call(path), null, 1).slice(0, 20_000);
  const items: unknown[] = [];
  const pages: string[] = [];
  let next: string | null = path;
  let total = NaN;
  while (next && pages.length < 200) {
    pages.push(next);
    const page = await call(next);
    if (!Array.isArray(page.body)) return JSON.stringify({ note: 'not a list', ...page }, null, 1).slice(0, 20_000);
    items.push(...page.body);
    total = Number(page.headers['x-total-count']);
    const link = page.headers.link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    const number = page.headers['x-next-page'];
    next = link ?? (number ? `${path}${path.includes('?') ? '&' : '?'}page=${number}` : null);
  }
  const complete = Number.isNaN(total) || items.length === total;
  return JSON.stringify({ count: items.length, total, complete, pages, items: items.slice(0, 50) }, null, 1).slice(0, 20_000);
}
