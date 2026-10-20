import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from './handlers.js';

export const routes = [
  { method: 'GET', path: '/products', handler: listProducts },
  { method: 'GET', path: '/products/:id', handler: getProduct },
  { method: 'POST', path: '/products', handler: createProduct },
  { method: 'PATCH', path: '/products/:id', handler: updateProduct },
  { method: 'DELETE', path: '/products/:id', handler: deleteProduct },
];
