import type { ServerRoute } from '@hapi/hapi';

/** Liveness probe used by docker-compose and Render. */
export const healthRoutes: ServerRoute[] = [
  {
    method: 'GET',
    path: '/health',
    options: { auth: false },
    handler: () => ({ status: 'ok' }),
  },
];
