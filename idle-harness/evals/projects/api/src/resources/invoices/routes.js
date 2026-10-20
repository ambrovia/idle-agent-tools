import { createInvoice, deleteInvoice, getInvoice, listInvoices, updateInvoice } from './handlers.js';

export const routes = [
  { method: 'GET', path: '/invoices', handler: listInvoices },
  { method: 'GET', path: '/invoices/:id', handler: getInvoice },
  { method: 'POST', path: '/invoices', handler: createInvoice },
  { method: 'PATCH', path: '/invoices/:id', handler: updateInvoice },
  { method: 'DELETE', path: '/invoices/:id', handler: deleteInvoice },
];
