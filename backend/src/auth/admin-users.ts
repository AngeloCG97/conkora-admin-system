import type { HasuraRequest } from '../hasura.ts';

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
}

/** Persistence port for `admin_user`; swapped for an in-memory fake in unit tests. */
export interface AdminUserStore {
  findByUsername(username: string): Promise<AdminUser | null>;
  count(): Promise<number>;
  create(username: string, passwordHash: string): Promise<void>;
}

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
}

export function hasuraAdminUserStore(request: HasuraRequest): AdminUserStore {
  return {
    async findByUsername(username) {
      const data = await request<{ admin_user: AdminUserRow[] }>(
        `query FindAdminUser($username: String!) {
          admin_user(where: { username: { _eq: $username } }, limit: 1) {
            id
            username
            password_hash
          }
        }`,
        { username },
      );
      const row = data.admin_user[0];
      return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
    },

    async count() {
      const data = await request<{ admin_user_aggregate: { aggregate: { count: number } } }>(
        `query CountAdminUsers { admin_user_aggregate { aggregate { count } } }`,
      );
      return data.admin_user_aggregate.aggregate.count;
    },

    async create(username, passwordHash) {
      // on_conflict keeps concurrent boots (several instances) idempotent.
      await request(
        `mutation CreateAdminUser($username: String!, $passwordHash: String!) {
          insert_admin_user_one(
            object: { username: $username, password_hash: $passwordHash }
            on_conflict: { constraint: admin_user_username_key, update_columns: [] }
          ) { id }
        }`,
        { username, passwordHash },
      );
    },
  };
}
