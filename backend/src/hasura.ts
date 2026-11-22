/**
 * Minimal GraphQL client that talks to Hasura with the admin secret.
 * Only Hapi holds the admin secret; the browser always uses a user JWT.
 */
export type HasuraRequest = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export function createHasuraAdminClient(options: { graphqlUrl: string; adminSecret: string }): HasuraRequest {
  return async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
    const response = await fetch(options.graphqlUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hasura-admin-secret': options.adminSecret,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`Hasura responded with HTTP ${response.status}`);
    }
    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors?.length) {
      throw new Error(`Hasura error: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (body.data === undefined) throw new Error('Hasura returned no data');
    return body.data;
  };
}

/** Polls Hasura's /healthz until it answers (Hasura may still be applying migrations). */
export async function waitForHasura(
  graphqlUrl: string,
  { attempts = 60, delayMs = 2000 }: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  const healthUrl = new URL('/healthz', graphqlUrl);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // not reachable yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Hasura not reachable at ${healthUrl} after ${attempts} attempts`);
}
