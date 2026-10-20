import { fail, ok } from '../../lib/respond.js';
import { validate } from '../../lib/validate.js';
import { schema } from './schema.js';
import { invoices } from './store.js';

export const listInvoices = () => ok(invoices.list());

export function getInvoice({ params }) {
  const found = invoices.get(params.id);
  return found ? ok(found) : fail(404, 'invoice not found');
}

export function createInvoice({ body }) {
  const problems = validate(schema, body);
  if (problems.length) return fail(400, 'invalid invoice', problems);
  return ok(invoices.add(body), 201);
}

export function updateInvoice({ params, body }) {
  const problems = validate(schema, body, { partial: true });
  if (problems.length) return fail(400, 'invalid invoice', problems);
  const updated = invoices.update(params.id, body);
  return updated ? ok(updated) : fail(404, 'invoice not found');
}

export function deleteInvoice({ params }) {
  return invoices.remove(params.id) ? ok({ deleted: params.id }) : fail(404, 'invoice not found');
}
