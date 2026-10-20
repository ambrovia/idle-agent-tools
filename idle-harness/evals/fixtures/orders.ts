// The data desk: half a year of a shop's orders, customers and products, as an export with the quirks real exports
// have, the questions a requester asks of it, and their right answers. Generated the same way every time.

// A small seeded random number generator (mulberry32), so every run sees the same data.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One order line as it really is, before the export writes it down.
export type Line = { order: number; line: number; date: string; customer: number; country: string; sku: string; category: string; quantity: number; price: number; status: 'fulfilled' | 'cancelled' | 'refunded' | 'pending'; segment: 'retail' | 'wholesale'; signedUp: string };

const COUNTRIES = [['DE', 'Germany'], ['FR', 'France'], ['NL', 'Netherlands'], ['AT', 'Austria'], ['IT', 'Italy'], ['ES', 'Spain']];
const CATEGORIES = ['tools', 'garden', 'kitchen', 'toys', 'office'];
const WORDS = ['Steel', 'Oak', 'Compact', 'Pro', 'Classic', 'Mini', 'Rapid', 'Soft', 'Ultra', 'Smart'];
const ITEMS: Record<string, string[]> = { tools: ['Hammer', 'Drill', 'Wrench', 'Saw'], garden: ['Hose', 'Rake', 'Planter', 'Shears'], kitchen: ['Pan', 'Knife', 'Grater', 'Kettle'], toys: ['Puzzle', 'Kite', 'Robot', 'Blocks'], office: ['Stapler', 'Lamp', 'Folder', 'Chair'] };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const csv = (rows: (string | number)[][]) => `${rows.map((row) => row.join(',')).join('\n')}\n`;

export function generate(seed = 7) {
  const r = random(seed);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const products = Array.from({ length: 60 }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length];
    return { sku: `SKU-${String(1000 + i * 7)}`, name: `${pick(WORDS)} ${pick(ITEMS[category])}`, category, price: Math.round((3 + r() ** 2 * 240) * 100) / 100 };
  });
  const customers = Array.from({ length: 800 }, (_, i) => {
    const signed = new Date(Date.UTC(2024, 0, 1) + Math.floor(r() * 900) * 86_400_000);
    return { id: 5001 + i, name: `Customer ${5001 + i}`, segment: (r() < 0.2 ? 'wholesale' : 'retail') as Line['segment'], country: pick(COUNTRIES)[0], signedUp: iso(signed) };
  });
  const lines: Line[] = [];
  const written: (string | number)[][] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let order = 100001; order <= 106200; order++) {
    const customer = pick(customers);
    if (customer.signedUp > '2026-06-30') continue;
    const when = new Date(start + Math.floor(r() * 181) * 86_400_000 + Math.floor(r() * 86_400_000));
    if (iso(when) < customer.signedUp) continue;
    const roll = r();
    const status: Line['status'] = roll < 0.75 ? 'fulfilled' : roll < 0.83 ? 'cancelled' : roll < 0.88 ? 'refunded' : 'pending';
    // How the export writes this order: its date format, country spelling, status spelling and price unit.
    const style = r();
    const date = style < 0.85 ? iso(when) : style < 0.95 ? `${iso(when).slice(8, 10)}/${iso(when).slice(5, 7)}/${iso(when).slice(0, 4)}` : `${when.toISOString().slice(0, 19)}Z`;
    const names = COUNTRIES.find(([code]) => code === customer.country)!;
    const spelling = r();
    const country = spelling < 0.8 ? names[0] : spelling < 0.9 ? names[1] : names[0].toLowerCase();
    const said = status === 'fulfilled' ? pick(['shipped', 'shipped', 'shipped', 'Shipped', 'SHIPPED ', 'delivered', 'delivered'])
      : status === 'cancelled' ? pick(['cancelled', 'cancelled', 'canceled']) : status;
    const cents = r() < 0.15;
    const count = 1 + Math.floor(r() ** 1.6 * 4);
    for (let line = 1; line <= count; line++) {
      const product = pick(products);
      const quantity = customer.segment === 'wholesale' ? 5 + Math.floor(r() * 46) : 1 + Math.floor(r() ** 2 * 5);
      lines.push({ order, line, date: iso(when), customer: customer.id, country: customer.country, sku: product.sku, category: product.category, quantity, price: product.price, status, segment: customer.segment, signedUp: customer.signedUp });
      const row = [order, line, date, customer.id, country, product.sku, quantity, cents ? Math.round(product.price * 100) : product.price.toFixed(2), cents ? 'cents' : 'eur', said];
      written.push(row);
      if (r() < 0.02) written.push(row); // the export sometimes repeats a row
    }
  }
  return {
    files: {
      'data/orders.csv': csv([['order_id', 'line', 'ordered_at', 'customer_id', 'country', 'sku', 'quantity', 'price', 'price_unit', 'status'], ...written]),
      'data/customers.csv': csv([['customer_id', 'name', 'segment', 'signed_up'], ...customers.map((c) => [c.id, c.name, c.segment, c.signedUp])]),
      'data/products.csv': csv([['sku', 'name', 'category'], ...products.map((p) => [p.sku, p.name, p.category])]),
    },
    lines,
  };
}

const money = (n: number) => Math.round(n * 100) / 100;
const percent = (n: number) => Math.round(n * 1000) / 10;
const revenue = (lines: Line[]) => money(lines.filter((l) => l.status === 'fulfilled').reduce((t, l) => t + l.quantity * l.price, 0));
const month = (l: Line) => l.date.slice(0, 7);
const orders = (lines: Line[]) => new Set(lines.map((l) => l.order));
const top = (counts: Map<string, number>) => [...counts].sort((a, b) => b[1] - a[1])[0][0];
const tally = (lines: Line[], key: (l: Line) => string, value: (l: Line) => number) => {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(key(l), (counts.get(key(l)) ?? 0) + value(l));
  return counts;
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The questions, each with what kind of answer it wants and how to work it out from the lines as they really are.
export type Question = { id: string; text: string; kind: 'money' | 'percent' | 'count' | 'name' | 'list' | 'amounts' | 'number'; answer(lines: Line[]): unknown };

export const QUESTIONS: Question[] = [
  { id: 'q01', kind: 'money', text: 'What was the revenue in March 2026, in euros?', answer: (ls) => revenue(ls.filter((l) => month(l) === '2026-03')) },
  { id: 'q02', kind: 'count', text: 'How many different customers placed an order in the first quarter of 2026 (any status)?', answer: (ls) => new Set(ls.filter((l) => l.date < '2026-04-01').map((l) => l.customer)).size },
  { id: 'q03', kind: 'name', text: 'Which country brought the most revenue in the first half of 2026? Answer with its two-letter ISO code.', answer: (ls) => top(tally(ls.filter((l) => l.status === 'fulfilled'), (l) => l.country, (l) => l.quantity * l.price)) },
  { id: 'q04', kind: 'percent', text: 'What share of wholesale customers\' orders were cancelled or refunded, in percent?', answer: (ls) => { const w = ls.filter((l) => l.segment === 'wholesale'); return percent(orders(w.filter((l) => l.status === 'cancelled' || l.status === 'refunded')).size / orders(w).size); } },
  { id: 'q05', kind: 'list', text: 'Which three SKUs sold the most units in February 2026 (fulfilled orders only)? Answer with a list of SKUs, most units first.', answer: (ls) => [...tally(ls.filter((l) => l.status === 'fulfilled' && month(l) === '2026-02'), (l) => l.sku, (l) => l.quantity)].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sku]) => sku) },
  { id: 'q06', kind: 'money', text: 'What was the average value of a fulfilled order from Germany, in euros? An order\'s value is the sum of its lines.', answer: (ls) => { const de = ls.filter((l) => l.status === 'fulfilled' && l.country === 'DE'); return money(revenue(de) / orders(de).size); } },
  { id: 'q07', kind: 'amounts', text: 'What was the revenue of each product category in April 2026? Answer with an object from category to euros.', answer: (ls) => Object.fromEntries([...tally(ls.filter((l) => l.status === 'fulfilled' && month(l) === '2026-04'), (l) => l.category, (l) => l.quantity * l.price)].map(([c, v]) => [c, money(v)])) },
  { id: 'q08', kind: 'name', text: 'Which customer brought the most revenue? Answer with the customer_id.', answer: (ls) => top(tally(ls.filter((l) => l.status === 'fulfilled'), (l) => String(l.customer), (l) => l.quantity * l.price)) },
  { id: 'q09', kind: 'count', text: 'On 30 June 2026, how many orders are still pending that were placed more than 30 days earlier (before 31 May 2026)?', answer: (ls) => orders(ls.filter((l) => l.status === 'pending' && l.date < '2026-05-31')).size },
  { id: 'q10', kind: 'name', text: 'In which month were the most orders placed (any status)? Answer as YYYY-MM.', answer: (ls) => top(tally([...new Map(ls.map((l) => [l.order, l])).values()], month, () => 1)) },
  { id: 'q11', kind: 'percent', text: 'What share of the revenue in the second quarter of 2026 came from wholesale customers, in percent?', answer: (ls) => { const q2 = ls.filter((l) => l.date >= '2026-04-01'); return percent(revenue(q2.filter((l) => l.segment === 'wholesale')) / revenue(q2)); } },
  { id: 'q12', kind: 'number', text: 'What is the median quantity of a fulfilled order line in the category tools?', answer: (ls) => { const q = ls.filter((l) => l.status === 'fulfilled' && l.category === 'tools').map((l) => l.quantity).sort((a, b) => a - b); return q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2; } },
  { id: 'q13', kind: 'money', text: 'How much revenue came from customers who signed up in 2026, in euros?', answer: (ls) => revenue(ls.filter((l) => l.signedUp >= '2026-01-01')) },
  { id: 'q14', kind: 'count', text: 'How many orders have three or more lines?', answer: (ls) => [...tally(ls, (l) => String(l.order), () => 1).values()].filter((n) => n >= 3).length },
  { id: 'q15', kind: 'name', text: 'On which day of the week was the most revenue made? Answer with the English name of the day.', answer: (ls) => top(tally(ls.filter((l) => l.status === 'fulfilled'), (l) => WEEKDAYS[new Date(`${l.date}T00:00:00Z`).getUTCDay()], (l) => l.quantity * l.price)) },
];

// Whether a given answer is the right one, within a cent for money and a tenth for percentages.
export function right(question: Question, given: unknown, truth: unknown): boolean {
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[€%\s,]/g, '')) : NaN);
  if (question.kind === 'money') return Math.abs(num(given) - (truth as number)) <= 0.01;
  if (question.kind === 'percent') return Math.abs(num(given) - (truth as number)) <= 0.1;
  if (question.kind === 'count' || question.kind === 'number') return num(given) === truth;
  if (question.kind === 'name') return String(given).trim().toLowerCase() === String(truth).toLowerCase();
  if (question.kind === 'list') return Array.isArray(given) && given.map(String).join() === (truth as string[]).join();
  if (question.kind === 'amounts') {
    const want = truth as Record<string, number>;
    return typeof given === 'object' && given !== null && Object.keys(want).every((key) => Math.abs(num((given as any)[key]) - want[key]) <= 0.01)
      && Object.keys(given).length === Object.keys(want).length;
  }
  return false;
}
