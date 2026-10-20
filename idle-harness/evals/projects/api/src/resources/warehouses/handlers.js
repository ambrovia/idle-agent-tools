import { fail, ok } from '../../lib/respond.js';
import { validate } from '../../lib/validate.js';
import { schema } from './schema.js';
import { warehouses } from './store.js';

export const listWarehouses = () => ok(warehouses.list());

export function getWarehouse({ params }) {
  const found = warehouses.get(params.id);
  return found ? ok(found) : fail(404, 'warehouse not found');
}

export function createWarehouse({ body }) {
  const problems = validate(schema, body);
  if (problems.length) return fail(400, 'invalid warehouse', problems);
  return ok(warehouses.add(body), 201);
}

export function updateWarehouse({ params, body }) {
  const problems = validate(schema, body, { partial: true });
  if (problems.length) return fail(400, 'invalid warehouse', problems);
  const updated = warehouses.update(params.id, body);
  return updated ? ok(updated) : fail(404, 'warehouse not found');
}

export function deleteWarehouse({ params }) {
  return warehouses.remove(params.id) ? ok({ deleted: params.id }) : fail(404, 'warehouse not found');
}
