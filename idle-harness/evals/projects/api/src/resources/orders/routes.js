import { createOrder, deleteOrder, getOrder, listOrders, updateOrder } from './handlers.js';

export const routes = [
  { method: 'GET', path: '/orders', handler: listOrders },
  { method: 'GET', path: '/orders/:id', handler: getOrder },
  { method: 'POST', path: '/orders', handler: createOrder },
  { method: 'PATCH', path: '/orders/:id', handler: updateOrder },
  { method: 'DELETE', path: '/orders/:id', handler: deleteOrder },
];
