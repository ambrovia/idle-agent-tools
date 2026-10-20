import { fail, ok } from '../../lib/respond.js';
import { validate } from '../../lib/validate.js';
import { schema } from './schema.js';
import { suppliers } from './store.js';

export const listSuppliers = () => ok(suppliers.list());

export function getSupplier({ params }) {
  const found = suppliers.get(params.id);
  return found ? ok(found) : fail(404, 'supplier not found');
}

export function createSupplier({ body }) {
  const problems = validate(schema, body);
  if (problems.length) return fail(400, 'invalid supplier', problems);
  return ok(suppliers.add(body), 201);
}

export function updateSupplier({ params, body }) {
  const problems = validate(schema, body, { partial: true });
  if (problems.length) return fail(400, 'invalid supplier', problems);
  const updated = suppliers.update(params.id, body);
  return updated ? ok(updated) : fail(404, 'supplier not found');
}

export function deleteSupplier({ params }) {
  return suppliers.remove(params.id) ? ok({ deleted: params.id }) : fail(404, 'supplier not found');
}
