import { createSupplier, deleteSupplier, getSupplier, listSuppliers, updateSupplier } from './handlers.js';

export const routes = [
  { method: 'GET', path: '/suppliers', handler: listSuppliers },
  { method: 'GET', path: '/suppliers/:id', handler: getSupplier },
  { method: 'POST', path: '/suppliers', handler: createSupplier },
  { method: 'PATCH', path: '/suppliers/:id', handler: updateSupplier },
  { method: 'DELETE', path: '/suppliers/:id', handler: deleteSupplier },
];
