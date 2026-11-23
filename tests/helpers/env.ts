/**
 * Endpoints and secrets of the local stack. Defaults match docker-compose.yml;
 * override with the same environment variables used there (.env.example).
 */
export const env = {
  hasuraUrl: `http://localhost:${process.env.HASURA_PORT ?? 8080}/v1/graphql`,
  apiUrl: `http://localhost:${process.env.API_PORT ?? 4000}`,
  databaseUrl: `postgres://postgres:postgres@localhost:${process.env.POSTGRES_PORT ?? 5432}/conkora`,
  jwtSecret: process.env.JWT_SECRET ?? 'conkora-dev-jwt-secret-change-me-0123456789',
  adminSecret: process.env.HASURA_ADMIN_SECRET ?? 'conkora-dev-admin-secret',
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'conkora-dev',
};
