import { fail, ok } from '../../lib/respond.js';
import { validate } from '../../lib/validate.js';
import { schema } from './schema.js';
import { orders } from './store.js';

export const listOrders = () => ok(orders.list());

export function getOrder({ params }) {
  const found = orders.get(params.id);
  return found ? ok(found) : fail(404, 'order not found');
}

export function createOrder({ body }) {
  const problems = validate(schema, body);
  if (problems.length) return fail(400, 'invalid order', problems);
  return ok(orders.add(body), 201);
}

export function updateOrder({ params, body }) {
  const problems = validate(schema, body, { partial: true });
  if (problems.length) return fail(400, 'invalid order', problems);
  const updated = orders.update(params.id, body);
  return updated ? ok(updated) : fail(404, 'order not found');
}

export function deleteOrder({ params }) {
  return orders.remove(params.id) ? ok({ deleted: params.id }) : fail(404, 'order not found');
}
