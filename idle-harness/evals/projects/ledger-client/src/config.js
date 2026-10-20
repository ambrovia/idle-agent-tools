import { readFileSync } from 'node:fs';

// Where the ledger service runs: LEDGER_URL when set, otherwise the url in service.json.
export const baseUrl = () => process.env.LEDGER_URL || JSON.parse(readFileSync(new URL('../service.json', import.meta.url), 'utf8')).url;
