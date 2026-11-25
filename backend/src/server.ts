import Hapi from '@hapi/hapi';
import type { AdminUserStore } from './auth/admin-users.ts';
import type { Config } from './config.ts';
import type { PublicOrderStore } from './public/order-dto.ts';
import { authRoutes } from './routes/auth.ts';
import { healthRoutes } from './routes/health.ts';
import { DEFAULT_PUBLIC_RATE_LIMIT, publicOrderRoutes, type PublicRateLimitConfig } from './routes/public-orders.ts';
import { uploadRoutes } from './routes/uploads.ts';

export interface ServerDeps {
  config: Pick<Config, 'port' | 'host' | 'corsOrigins' | 'jwt'> &
    Partial<Pick<Config, 'cloudinary' | 'trustedProxyHops'>>;
  adminUsers: AdminUserStore;
  /** Public page of a shared Pedido (issue #35). Without it the endpoint answers 404 for every token. */
  publicOrders?: PublicOrderStore;
  /** Overrides the rate limit of the public endpoint (tests). */
  publicRateLimit?: Partial<Omit<PublicRateLimitConfig, 'trustedProxyHops'>>;
}

const NO_PUBLIC_ORDERS: PublicOrderStore = { findByToken: async () => null };

/**
 * Builds the Hapi server without starting it, so tests can use `server.inject()`.
 * Add new route modules here (each exports a function returning ServerRoute[]).
 */
export function createServer({ config, adminUsers, publicOrders, publicRateLimit }: ServerDeps): Hapi.Server {
  const server = Hapi.server({
    port: config.port,
    host: config.host,
    routes: {
      cors: { origin: config.corsOrigins },
    },
  });

  server.route([
    ...healthRoutes,
    ...authRoutes({ adminUsers, jwt: config.jwt }),
    ...uploadRoutes({ jwt: config.jwt, cloudinary: config.cloudinary }),
    ...publicOrderRoutes({
      publicOrders: publicOrders ?? NO_PUBLIC_ORDERS,
      corsOrigins: config.corsOrigins,
      rateLimit: {
        ...DEFAULT_PUBLIC_RATE_LIMIT,
        ...publicRateLimit,
        trustedProxyHops: config.trustedProxyHops ?? 0,
      },
    }),
  ]);

  return server;
}
