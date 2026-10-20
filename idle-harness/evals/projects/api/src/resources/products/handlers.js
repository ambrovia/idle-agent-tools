import { fail, ok } from '../../lib/respond.js';
import { validate } from '../../lib/validate.js';
import { schema } from './schema.js';
import { products } from './store.js';

export const listProducts = () => ok(products.list());

export function getProduct({ params }) {
  const found = products.get(params.id);
  return found ? ok(found) : fail(404, 'product not found');
}

export function createProduct({ body }) {
  const problems = validate(schema, body);
  if (problems.length) return fail(400, 'invalid product', problems);
  return ok(products.add(body), 201);
}

export function updateProduct({ params, body }) {
  const problems = validate(schema, body, { partial: true });
  if (problems.length) return fail(400, 'invalid product', problems);
  const updated = products.update(params.id, body);
  return updated ? ok(updated) : fail(404, 'product not found');
}

export function deleteProduct({ params }) {
  return products.remove(params.id) ? ok({ deleted: params.id }) : fail(404, 'product not found');
}
