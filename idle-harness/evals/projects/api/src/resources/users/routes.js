import { createUser, deleteUser, getUser, listUsers, updateUser } from './handlers.js';

export const routes = [
  { method: 'GET', path: '/users', handler: listUsers },
  { method: 'GET', path: '/users/:id', handler: getUser },
  { method: 'POST', path: '/users', handler: createUser },
  { method: 'PATCH', path: '/users/:id', handler: updateUser },
  { method: 'DELETE', path: '/users/:id', handler: deleteUser },
];
