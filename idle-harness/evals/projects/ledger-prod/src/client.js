import { baseUrl } from './config.js';

// Calls the ledger service and returns the body of its answer.
export async function call(method, path, body) {
  const answer = await fetch(`${baseUrl()}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await answer.json();
  if (!answer.ok) throw new Error(`${method} ${path}: ${answer.status} ${data.error ?? ''}`);
  return data;
}
