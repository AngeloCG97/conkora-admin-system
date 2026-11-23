/** Public runtime configuration, inlined at build time (static export). */
export const config = {
  hasuraUrl: process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

/** Prefixes a file in `public/` with the basePath (needed on GitHub Pages). */
export function assetPath(path: string): string {
  return `${config.basePath}${path}`;
}
