import { createWarehouse, deleteWarehouse, getWarehouse, listWarehouses, updateWarehouse } from './handlers.js';

export const routes = [
  { method: 'GET', path: '/warehouses', handler: listWarehouses },
  { method: 'GET', path: '/warehouses/:id', handler: getWarehouse },
  { method: 'POST', path: '/warehouses', handler: createWarehouse },
  { method: 'PATCH', path: '/warehouses/:id', handler: updateWarehouse },
  { method: 'DELETE', path: '/warehouses/:id', handler: deleteWarehouse },
];
