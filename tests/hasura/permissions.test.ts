import { afterAll, describe, expect, it } from 'vitest';
import { asAdmin, graphql, rootFieldNames, signTestJwt, typeNames } from '../helpers/hasura.ts';

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

describe('currency', () => {
  const CODE = 'ZZZ';

  afterAll(async () => {
    await asAdmin(`mutation { delete_currency(where: { code: { _eq: "${CODE}" } }) { affected_rows } }`);
  });

  it('manager lists the seeded USD and CRC', async () => {
    const result = await graphql<{ currency: { code: string; global_rate: number }[] }>(
      '{ currency(order_by: { code: asc }) { code name symbol global_rate } }',
      { auth: { token: await signTestJwt() } },
    );
    expect(result.errors).toBeUndefined();
    const usd = result.data!.currency.find((c) => c.code === 'USD');
    expect(usd?.global_rate).toBe(1);
    expect(result.data!.currency.map((c) => c.code)).toContain('CRC');
  });

  it('manager inserts, updates a currency and cannot delete', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql(
      `mutation { insert_currency_one(object: { code: "${CODE}", name: "Prueba", symbol: "Z", global_rate: 2 }) { code } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const upd = await graphql(
      `mutation { update_currency_by_pk(pk_columns: { code: "${CODE}" }, _set: { global_rate: 3.5 }) { global_rate } }`,
      { auth },
    );
    expect(upd.errors).toBeUndefined();
    expect(upd.data).toEqual({ update_currency_by_pk: { global_rate: 3.5 } });
    expect(await rootFieldNames(auth.token, 'mutationType')).not.toContain('delete_currency');
  });

  it('rejects invalid codes, non-positive rates and a USD rate other than 1', async () => {
    const auth = { token: await signTestJwt() };
    for (const object of [
      '{ code: "AB", name: "x", symbol: "x", global_rate: 1 }',
      '{ code: "abc", name: "x", symbol: "x", global_rate: 1 }',
      `{ code: "${CODE}", name: "x", symbol: "x", global_rate: 0 }`,
      `{ code: "${CODE}", name: "x", symbol: "x", global_rate: -5 }`,
    ]) {
      const r = await graphql(`mutation { insert_currency_one(object: ${object}) { code } }`, { auth });
      expect(r.errors?.[0]?.message, object).toMatch(/violates check constraint/);
    }
    const usd = await graphql(
      'mutation { update_currency_by_pk(pk_columns: { code: "USD" }, _set: { global_rate: 2 }) { code } }',
      { auth },
    );
    expect(usd.errors?.[0]?.message).toMatch(/currency_usd_rate_is_one/);
  });
});
