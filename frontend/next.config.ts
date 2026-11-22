import type { NextConfig } from 'next';

// Static export only (ADR-0001): no SSR, route handlers or Server Actions.
// Detail pages use query params (`/viajes/detalle?id=...`), not dynamic routes.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
