import { SignJWT } from 'jose';
import { env } from './env.ts';

export interface GraphQLError {
  message: string;
  extensions?: { code?: string; path?: string };
}

export interface GraphQLResult<T = Record<string, unknown>> {
  data?: T;
  errors?: GraphQLError[];
}

type Auth = { token: string } | { adminSecret: string } | { none: true };

/** Sends a GraphQL request to Hasura. Hasura answers HTTP 200 even for auth errors. */
export async function graphql<T = Record<string, unknown>>(
  query: string,
  { auth, variables = {} }: { auth: Auth; variables?: Record<string, unknown> },
): Promise<GraphQLResult<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if ('token' in auth) headers.authorization = `Bearer ${auth.token}`;
  if ('adminSecret' in auth) headers['x-hasura-admin-secret'] = auth.adminSecret;

  const response = await fetch(env.hasuraUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GraphQLResult<T>;
}

/** Shorthand for a request as the `manager` role with a freshly signed JWT. */
export async function asManager<T = Record<string, unknown>>(query: string, variables?: Record<string, unknown>) {
  return graphql<T>(query, { auth: { token: await signTestJwt() }, variables });
}

/** Shorthand for a request with the admin secret (for test setup/cleanup only). */
export function asAdmin<T = Record<string, unknown>>(query: string, variables?: Record<string, unknown>) {
  return graphql<T>(query, { auth: { adminSecret: env.adminSecret }, variables });
}

/** Signs a JWT shaped like the ones Hapi issues (backend/src/auth/tokens.ts). */
export async function signTestJwt({
  role = 'manager',
  secret = env.jwtSecret,
  expiresInSeconds = 3600,
  userId = '00000000-0000-0000-0000-000000000000',
}: { role?: string; secret?: string; expiresInSeconds?: number; userId?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    'https://hasura.io/jwt/claims': {
      'x-hasura-default-role': role,
      'x-hasura-allowed-roles': [role],
      'x-hasura-user-id': userId,
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
}

/** Names of the root fields (queries or mutations) visible to a role, via introspection. */
export async function rootFieldNames(token: string, root: 'queryType' | 'mutationType' = 'queryType') {
  const result = await graphql<{ __schema: Record<string, { fields: { name: string }[] } | null> }>(
    `{ __schema { ${root} { fields { name } } } }`,
    { auth: { token } },
  );
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return (result.data!.__schema[root]?.fields ?? []).map((f) => f.name);
}

/** Names of all types in the schema visible to a role. */
export async function typeNames(token: string) {
  const result = await graphql<{ __schema: { types: { name: string }[] } }>(`{ __schema { types { name } } }`, {
    auth: { token },
  });
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data!.__schema.types.map((t) => t.name);
}
