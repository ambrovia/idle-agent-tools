import { routes as users } from './resources/users/routes.js';
import { routes as products } from './resources/products/routes.js';
import { routes as orders } from './resources/orders/routes.js';
import { routes as invoices } from './resources/invoices/routes.js';
import { routes as suppliers } from './resources/suppliers/routes.js';
import { routes as warehouses } from './resources/warehouses/routes.js';

// Every resource's routes. A new resource is added here.
export const routes = [...users, ...products, ...orders, ...invoices, ...suppliers, ...warehouses];
