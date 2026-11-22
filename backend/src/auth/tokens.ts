import { SignJWT } from 'jose';

/** The only application role (see PRD, "Capa GraphQL de Hasura"). */
export const MANAGER_ROLE = 'manager';

export const HASURA_CLAIMS_NAMESPACE = 'https://hasura.io/jwt/claims';

export interface AccessToken {
  token: string;
  /** ISO-8601 timestamp. */
  expiresAt: string;
}

export async function signAccessToken(
  user: { id: string; username: string },
  options: { secret: string; expiresInSeconds: number; now?: Date },
): Promise<AccessToken> {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const expiresAt = issuedAt + options.expiresInSeconds;

  const token = await new SignJWT({
    name: user.username,
    [HASURA_CLAIMS_NAMESPACE]: {
      'x-hasura-default-role': MANAGER_ROLE,
      'x-hasura-allowed-roles': [MANAGER_ROLE],
      'x-hasura-user-id': user.id,
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(options.secret));

  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}
