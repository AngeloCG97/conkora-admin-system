import { redirectToLogin } from './auth';
import { config } from './config';
import { reportNetworkFailure, reportNetworkSuccess } from './connectivity';
import { getSession } from './session';

interface GraphQLErrorPayload {
  message: string;
  extensions?: { code?: string };
}

export class GraphQLRequestError extends Error {
  readonly errors: GraphQLErrorPayload[];

  constructor(errors: GraphQLErrorPayload[]) {
    super(errors.map((e) => e.message).join('; '));
    this.errors = errors;
  }

  /** Hasura error code of the first error, e.g. `constraint-violation`. */
  get code(): string | undefined {
    return this.errors[0]?.extensions?.code;
  }
}

/** Hasura answers HTTP 200 with these codes when the JWT is missing, expired or invalid. */
const AUTH_ERROR_CODES = new Set(['invalid-jwt', 'invalid-headers', 'access-denied']);

/**
 * Sends a GraphQL operation to Hasura as the logged-in `manager`.
 * Use it as the `queryFn`/`mutationFn` of TanStack Query:
 *
 *   const { data } = useQuery({ queryKey: ['trips'], queryFn: () => gqlRequest<TripsData>(TRIPS) });
 *
 * On an auth failure it clears the session and redirects to /login.
 */
export async function gqlRequest<TData, TVariables extends Record<string, unknown> = Record<string, unknown>>(
  query: string,
  variables?: TVariables,
): Promise<TData> {
  const session = getSession();
  if (!session) {
    redirectToLogin();
    throw new GraphQLRequestError([{ message: 'Sesión expirada', extensions: { code: 'invalid-jwt' } }]);
  }

  let response: Response;
  try {
    response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    reportNetworkFailure(); // no response at all: shows the "Sin conexión" banner
    throw error;
  }
  reportNetworkSuccess();

  if (response.status === 401) {
    redirectToLogin();
    throw new GraphQLRequestError([{ message: 'Sesión expirada', extensions: { code: 'invalid-jwt' } }]);
  }

  const body = (await response.json()) as { data?: TData; errors?: GraphQLErrorPayload[] };
  if (body.errors?.length) {
    if (body.errors.some((e) => AUTH_ERROR_CODES.has(e.extensions?.code ?? ''))) redirectToLogin();
    throw new GraphQLRequestError(body.errors);
  }
  return body.data as TData;
}
