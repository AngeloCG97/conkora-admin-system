import { hasuraAdminUserStore } from './auth/admin-users.ts';
import { ensureInitialAdmin } from './auth/initial-admin.ts';
import { loadConfig } from './config.ts';
import { createHasuraAdminClient, waitForHasura } from './hasura.ts';
import { createServer } from './server.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const hasura = createHasuraAdminClient(config.hasura);
  const adminUsers = hasuraAdminUserStore(hasura);

  await waitForHasura(config.hasura.graphqlUrl);
  await ensureInitialAdmin(adminUsers, config.initialAdmin, console.log);

  const server = createServer({ config, adminUsers });
  await server.start();
  console.log(`API listening on ${server.info.uri}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.stop({ timeout: 5000 }).then(() => process.exit(0));
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
