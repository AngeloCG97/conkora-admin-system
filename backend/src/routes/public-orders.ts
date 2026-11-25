import type { ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { isShareTokenFormat, type PublicOrderStore } from '../public/order-dto.ts';
import { clientIp, createRateLimiter } from '../public/rate-limit.ts';

/**
 * The only public endpoint with business data (issue #35): a Pedido's page for its Cliente, looked up by
 * the secret token of its link. No JWT; Hapi queries Hasura with the admin secret using a fixed query and
 * answers only the curated DTO. Invalid, unknown, revoked or Cancelado → the same 404 every time.
 */

export interface PublicRateLimitConfig {
  /** Requests per IP per window (also the burst size). */
  requests: number;
  windowSeconds: number;
  /** Reverse proxies in front of Hapi that append to X-Forwarded-For (Render: 1; local: 0). */
  trustedProxyHops: number;
}

export const DEFAULT_PUBLIC_RATE_LIMIT: PublicRateLimitConfig = { requests: 30, windowSeconds: 60, trustedProxyHops: 0 };

/** Identical to Hapi's own 404, so a malformed path is indistinguishable from an unknown token. */
export const NOT_FOUND_BODY = { statusCode: 404, error: 'Not Found', message: 'Not Found' } as const;
export const RATE_LIMITED_BODY = {
  statusCode: 429,
  error: 'Too Many Requests',
  message: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
} as const;
const SERVER_ERROR_BODY = { statusCode: 500, error: 'Internal Server Error', message: 'Ocurrió un error' } as const;

function respond(h: ResponseToolkit, body: object, code: number) {
  return h
    .response(body)
    .code(code)
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .header('x-content-type-options', 'nosniff')
    .header('x-robots-tag', 'noindex, nofollow');
}

export function publicOrderRoutes(deps: {
  publicOrders: PublicOrderStore;
  corsOrigins: string[];
  rateLimit?: PublicRateLimitConfig;
}): ServerRoute[] {
  const settings = deps.rateLimit ?? DEFAULT_PUBLIC_RATE_LIMIT;
  const limiter = createRateLimiter({ capacity: settings.requests, windowMs: settings.windowSeconds * 1000 });

  return [
    {
      method: 'GET',
      path: '/public/orders/{token}',
      options: {
        auth: false,
        cors: { origin: deps.corsOrigins, credentials: false },
      },
      handler: async (request, h) => {
        const ip = clientIp(request.headers['x-forwarded-for'] as string | string[] | undefined, request.info.remoteAddress, settings.trustedProxyHops);
        if (!limiter.take(ip)) {
          return respond(h, RATE_LIMITED_BODY, 429).header('retry-after', String(settings.windowSeconds));
        }
        const { token } = request.params as { token: string };
        if (!isShareTokenFormat(token)) return respond(h, NOT_FOUND_BODY, 404);
        let order;
        try {
          order = await deps.publicOrders.findByToken(token);
        } catch (error) {
          request.log(['error'], error instanceof Error ? error.message : String(error));
          return respond(h, SERVER_ERROR_BODY, 500);
        }
        if (!order) return respond(h, NOT_FOUND_BODY, 404);
        return respond(h, order, 200);
      },
    },
  ];
}
