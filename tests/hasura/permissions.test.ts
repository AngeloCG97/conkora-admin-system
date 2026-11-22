import { describe, expect, it } from 'vitest';
import { graphql, rootFieldNames, signTestJwt, typeNames } from '../helpers/hasura.ts';

/**
 * Hasura permissions for the `manager` role (PRD, "Capa GraphQL de Hasura").
 * Each slice that adds tables or views extends this file with its own cases.
 */

function errorCode(result: { errors?: { extensions?: { code?: string } }[] }) {
  return result.errors?.[0]?.extensions?.code;
}

describe('authentication', () => {
  it('rejects requests without a JWT', async () => {
    const result = await graphql('{ __typename }', { auth: { none: true } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-headers');
  });

  it('rejects an expired JWT', async () => {
    const token = await signTestJwt({ expiresInSeconds: -30 });
    const result = await graphql('{ __typename }', { auth: { token } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-jwt');
  });

  it('rejects a JWT signed with another secret', async () => {
    const token = await signTestJwt({ secret: 'some-other-secret-that-is-32-chars-long!!' });
    const result = await graphql('{ __typename }', { auth: { token } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-jwt');
  });

  it('accepts a valid manager JWT', async () => {
    const result = await graphql('{ __typename }', { auth: { token: await signTestJwt() } });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ __typename: 'query_root' });
  });
});

describe('admin_user', () => {
  it('is not part of the manager schema', async () => {
    const token = await signTestJwt();
    expect(await rootFieldNames(token, 'queryType')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/admin_user/)]),
    );
    expect(await rootFieldNames(token, 'mutationType')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/admin_user/)]),
    );
    expect(await typeNames(token)).not.toEqual(expect.arrayContaining([expect.stringMatching(/admin_user/)]));
  });

  it('cannot be queried by a manager', async () => {
    const result = await graphql('{ admin_user { id username password_hash } }', {
      auth: { token: await signTestJwt() },
    });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('validation-failed');
  });
});
