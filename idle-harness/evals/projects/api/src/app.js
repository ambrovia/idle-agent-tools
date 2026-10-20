import { routes } from './routes.js';
import { fail } from './lib/respond.js';

// Finds the route for a request and runs its handler. Paths look like /users or /users/usr_1.
export function handle(request) {
  const parts = request.path.split('/').filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (route.method !== request.method || pattern.length !== parts.length) continue;
    const params = {};
    if (pattern.every((piece, i) => (piece.startsWith(':') ? (params[piece.slice(1)] = parts[i]) : piece === parts[i]))) {
      return route.handler({ query: {}, body: {}, ...request, params });
    }
  }
  return fail(404, 'not found');
}
