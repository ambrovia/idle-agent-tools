// Runs the ledger service in a process of its own: prints its URL, and takes commands a line at a time on stdin.
import { start } from './ledger-service.ts';

const service = await start((process.argv[2] ?? 'v1') as 'v1' | 'v2');
process.stdout.write(`${service.url}\n`);
process.stdin.setEncoding('utf8');
// A line is a mode (v1, v2), "budget <n>", "seed <json rows>", or "stats", which answers with one line of JSON.
process.stdin.on('data', (text: string) => {
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line === 'v1' || line === 'v2') service.setMode(line);
    else if (line.startsWith('budget ')) service.budget(Number(line.slice(7)));
    else if (line.startsWith('seed ')) service.seed(JSON.parse(line.slice(5)));
    else if (line === 'stats') process.stdout.write(`${JSON.stringify(service.stats())}\n`);
  }
});
process.stdin.on('end', () => process.exit(0));
