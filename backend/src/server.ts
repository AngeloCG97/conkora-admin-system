import Hapi from '@hapi/hapi';
import type { AdminUserStore } from './auth/admin-users.ts';
import type { Config } from './config.ts';
import { authRoutes } from './routes/auth.ts';
import { healthRoutes } from './routes/health.ts';
import { uploadRoutes } from './routes/uploads.ts';

export interface ServerDeps {
  config: Pick<Config, 'port' | 'host' | 'corsOrigins' | 'jwt'> & Partial<Pick<Config, 'cloudinary'>>;
  adminUsers: AdminUserStore;
}

/**
 * Builds the Hapi server without starting it, so tests can use `server.inject()`.
 * Add new route modules here (each exports a function returning ServerRoute[]).
 */
export function createServer({ config, adminUsers }: ServerDeps): Hapi.Server {
  const server = Hapi.server({
    port: config.port,
    host: config.host,
    routes: {
      cors: { origin: config.corsOrigins },
    },
  });

  server.route([...healthRoutes, ...authRoutes({ adminUsers, jwt: config.jwt }),
    ...uploadRoutes({ jwt: config.jwt, cloudinary: config.cloudinary }),
  ]);

  return server;
}
