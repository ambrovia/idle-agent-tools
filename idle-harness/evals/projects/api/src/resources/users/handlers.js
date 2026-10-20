import { fail, ok } from '../../lib/respond.js';
import { validate } from '../../lib/validate.js';
import { schema } from './schema.js';
import { users } from './store.js';

export const listUsers = () => ok(users.list());

export function getUser({ params }) {
  const found = users.get(params.id);
  return found ? ok(found) : fail(404, 'user not found');
}

export function createUser({ body }) {
  const problems = validate(schema, body);
  if (problems.length) return fail(400, 'invalid user', problems);
  return ok(users.add(body), 201);
}

export function updateUser({ params, body }) {
  const problems = validate(schema, body, { partial: true });
  if (problems.length) return fail(400, 'invalid user', problems);
  const updated = users.update(params.id, body);
  return updated ? ok(updated) : fail(404, 'user not found');
}

export function deleteUser({ params }) {
  return users.remove(params.id) ? ok({ deleted: params.id }) : fail(404, 'user not found');
}
