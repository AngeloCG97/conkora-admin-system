import type { AdminUserStore } from './admin-users.ts';
import { hashPassword } from './passwords.ts';

/** Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD when the table is empty. */
export async function ensureInitialAdmin(
  store: AdminUserStore,
  credentials: { username: string; password: string },
  log: (message: string) => void = () => {},
): Promise<boolean> {
  if ((await store.count()) > 0) return false;
  await store.create(credentials.username, await hashPassword(credentials.password));
  log(`Created initial admin "${credentials.username}"`);
  return true;
}
