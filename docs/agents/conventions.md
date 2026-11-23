# Conventions (read this before implementing a slice)

Architecture is fixed by the PRD (issue #1) and ADR-0001/0002. This file says *where things go* and
*how to add them*. Keep it accurate when you change a pattern.

## Layout

```
docker-compose.yml        Postgres 17 + Hasura v2.51 (cli-migrations image) + Hapi (backend/Dockerfile)
package.json              Orchestration scripts only (no workspaces; each folder has its own lockfile)
scripts/test-integration.sh
hasura/
  migrations/default/<ms-timestamp>_<name>/{up,down}.sql
  metadata/databases/default/tables/{tables.yaml, public_<table>.yaml}
backend/src/              Hapi on Node 24, TypeScript run directly by node (type stripping, no build)
  index.ts                boot: wait for Hasura, ensure initial admin, start
  server.ts               createServer(deps): registers route modules (tests use server.inject)
  routes/*.ts             one module per feature, exports ServerRoute[]
  auth/                   tokens (JWT claims), passwords (bcrypt), admin-user store, initial admin
backend/test/*.test.ts    unit tests (vitest, server.inject, in-memory fakes)
frontend/src/
  app/login/page.tsx      public
  app/(app)/layout.tsx    AuthGuard + AppShell: everything under (app)/ is protected
  app/(app)/<seccion>/page.tsx
  components/feedback/    FeedbackProvider (useNotify, useConfirm), Loading
  components/layout/      AppShell, navigation.ts (menu), PageHeader, Logo, ComingSoon
  lib/                    config, session (JWT in localStorage), auth (login), graphql (gqlRequest)
  theme/                  brand.ts (palette hex values), theme.ts (MUI theme), ThemeRegistry
tests/                    integration tests against the running stack
  helpers/env.ts          URLs/secrets (defaults = docker-compose defaults)
  helpers/hasura.ts       graphql(), asManager(), asAdmin(), signTestJwt(), rootFieldNames()
  helpers/db.ts           withRollback(fn) — pg client inside a rolled-back transaction
  hasura/permissions.test.ts   role `manager` permissions
  api/*.test.ts           Hapi endpoints end to end
  db/*.test.ts            SQL tables/views (financial calculations)
```

## Commands (always `source ~/.nvm/nvm.sh && nvm use 24` first; `.nvmrc` = 24)

| What | Command |
| --- | --- |
| Install deps | `npm run setup` |
| Start / stop stack | `npm run stack:up` / `npm run stack:down` |
| Wipe DB and restart | `npm run stack:reset` |
| Frontend dev server | `npm run dev` (http://localhost:3000, login `admin` / `conkora-dev`) |
| Lint + typecheck + static build | `npm run check` |
| All tests | `npm test` (= `test:unit` + `test:integration`; the latter runs `docker compose up -d --build --wait` first and leaves the stack running) |
| One integration file | `scripts/test-integration.sh hasura/permissions.test.ts` |

Both `npm run check` and `npm test` must pass before opening a PR.

## Naming

- DB/GraphQL/code identifiers in English, singular snake_case tables as in the PRD schema
  (`trip`, `trip_rate`, `expense`, `customer`, `order`, `order_item`, `payment`).
- UI text and routes in Spanish using `CONTEXT.md` terms (Viaje, Gasto, Pedido, Artículo, Abono, Saldo…):
  `/viajes/`, `/gastos/`, `/clientes/`, `/pedidos/`, `/reportes/`, `/monedas/`.

## Adding a table (migration + metadata + permissions)

1. Create `hasura/migrations/default/<Date.now()>_<snake_name>/up.sql` and `down.sql` (timestamp must be
   greater than the previous one). Never edit a migration that is already on `main`; add a new one.
   Schema rules: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` for business entities; money
   `numeric(14,2)` with CHECKs from the PRD (`>= 0`, `> 0`); exchange rates `numeric(18,6)`;
   `created_at timestamptz NOT NULL DEFAULT now()`; FKs `ON DELETE RESTRICT` (Viaje, Cliente) or
   `CASCADE` (Pedido → Artículos/Abonos) as in the PRD. Reference tables (`expense_category`,
   `order_status`) are Hasura enum tables: `value text PRIMARY KEY, comment text`, seeded in the
   migration, `is_enum: true` in metadata.
2. Add `hasura/metadata/databases/default/tables/public_<table>.yaml` and include it in `tables.yaml`
   (keep alphabetical). Business entity with full CRUD for `manager`:

   ```yaml
   table: { name: trip, schema: public }
   array_relationships:
     - name: expenses
       using: { foreign_key_constraint_on: { column: trip_id, table: { name: expense, schema: public } } }
   select_permissions:
     - role: manager
       permission: { columns: [id, name, destination, start_date, end_date, notes, created_at], filter: {} , allow_aggregations: true }
   insert_permissions:
     - role: manager
       permission: { check: {}, columns: [name, destination, start_date, end_date, notes] }
   update_permissions:
     - role: manager
       permission: { filter: {}, check: {}, columns: [name, destination, start_date, end_date, notes] }
   delete_permissions:
     - role: manager
       permission: { filter: {} }
   ```
   Views and reference tables get **only** `select_permissions`. `admin_user` gets none — never add any.
3. Apply: `docker compose restart hasura` (the image applies pending migrations + metadata on start).
   If you changed an already-applied migration locally, use `npm run stack:reset`.
4. Test in `tests/hasura/permissions.test.ts` (extend it, one `describe` per table): manager can
   insert/select/update/delete (clean up with `asAdmin` in `afterAll`), and for views/reference
   tables that `insert_*`/`update_*` root fields are absent (`rootFieldNames(token, 'mutationType')`).

Hasura returns numerics as JSON numbers (`HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES` is off).
Hasura answers auth/permission errors with HTTP 200 + `errors[].extensions.code`
(CHECK constraint failures come back as `permission-error` with message "Check constraint violation...", not `constraint-violation`;
`invalid-headers` = no JWT, `invalid-jwt` = expired/bad signature, `validation-failed` = field not in role schema,
`constraint-violation` = FK/unique/check failed).

## Adding a SQL view (financial calculations, PRD "Módulo 1")

1. `CREATE VIEW` in a new migration (`down.sql`: `DROP VIEW`). Conversion happens in the view (ADR-0002);
   use `COALESCE(..., 0)` so empty aggregates are `0`, and `round(x, 2)` for money outputs.
2. Track it with a `public_<view>.yaml` (select permission for `manager` only) and add relationships
   from the tables (`manual_configuration` with `remote_table` + `column_mapping`).
3. Test in `tests/db/<view>.test.ts` straight against Postgres:

   ```ts
   import { withRollback } from '../helpers/db.ts';
   it('Pedido sin Artículos ni Abonos → Total 0', () => withRollback(async (db) => {
     const { rows: [c] } = await db.query(`INSERT INTO customer (name) VALUES ('Ana') RETURNING id`);
     // ...insert fixtures...
     const { rows } = await db.query('SELECT total FROM order_summary WHERE order_id = $1', [orderId]);
     expect(rows[0].total).toBe(0); // NUMERIC is parsed to number in helpers/db.ts
   }));
   ```
   Everything rolls back, so tests never leave data behind and can run in any order.

## Backend (Hapi)

- New endpoint: `backend/src/routes/<feature>.ts` exporting `xxxRoutes(deps): ServerRoute[]`, registered in
  `server.ts`; validate payloads with Joi; errors with `@hapi/boom`; user-facing messages in Spanish.
- Node runs `.ts` directly: relative imports must end in `.ts`, `import type` for types, no enums /
  namespaces / constructor parameter properties (`erasableSyntaxOnly`).
- Hapi talks to Hasura with the admin secret via `createHasuraAdminClient` (`src/hasura.ts`); the browser never does.
- New env var: add to `src/config.ts`, `docker-compose.yml` (with a dev default), `.env.example`,
  and `tests/helpers/env.ts` if tests need it.
- Unit test with `createServer({ config, ...fakes }).inject(...)` in `backend/test/`.

## Frontend

- Static export only: no server components that fetch, no route handlers, no Server Actions, no dynamic
  `[id]` routes. Pages that use hooks start with `'use client'`.
- New section page: `src/app/(app)/<seccion>/page.tsx`; replace its `<ComingSoon>`; keep `NAV_ITEMS`
  in `components/layout/navigation.ts` in sync. Start pages with `<PageHeader title=... actions=... />`.
- Detail pages use a query param, e.g. `src/app/(app)/viajes/detalle/page.tsx` at `/viajes/detalle/?id=<uuid>`.
  `useSearchParams()` must be inside a component wrapped in `<Suspense fallback={<Loading />}>`
  (the build fails otherwise). Link with `<Link href={`/viajes/detalle/?id=${id}`}>` (paths without
  basePath; always keep the trailing slash before `?`).
- Data: TanStack Query + `gqlRequest` (adds the JWT; on `invalid-jwt`/`invalid-headers` it clears the
  session and redirects to `/login/`):

  ```tsx
  const { data, isPending } = useQuery({ queryKey: ['trips'], queryFn: () => gqlRequest<TripsData>(TRIPS_QUERY) });
  const qc = useQueryClient(); const notify = useNotify(); const confirm = useConfirm();
  const remove = useMutation({
    mutationFn: (id: string) => gqlRequest(DELETE_TRIP, { id }),
    onSuccess: () => { notify.success('Viaje eliminado'); qc.invalidateQueries({ queryKey: ['trips'] }); },
    onError: (e) => notify.error(e instanceof GraphQLRequestError && e.code === 'constraint-violation'
      ? 'No se puede eliminar: el Viaje tiene Gastos o Pedidos' : 'No se pudo eliminar'),
  });
  // if (await confirm({ title: '¿Eliminar el Viaje?', confirmText: 'Eliminar', danger: true })) remove.mutate(id);
  ```
  Put GraphQL documents as `const` strings next to the page (or `src/graphql/<entity>.ts` when shared)
  with hand-written TypeScript result types. Show `<Loading />` while `isPending`.
- Money: never format amounts inline. `src/lib/money.ts` (created in #3; `formatMoney(amount, currency)`,
  e.g. `$1,250.00`, `₡505.000`) with unit tests; every screen uses it. Amounts in other currencies are
  converted by SQL views, never in the frontend.
- Forms: a `Dialog` component per entity next to its page (see `monedas/page.tsx`): local `useState` fields,
  `touched` flag for validation messages, `useMutation` + `qc.invalidateQueries`, `key` on the dialog to reset state.
  Currency is keyed by `code` (text PK, not uuid); the table has no DELETE permission.
- Parent/child + detail: list page (`viajes/page.tsx`) links to `viajes/detalle/?id=` (cards via `CardActionArea component={Link}`);
  the detail page owns edit (`viajes/TripDialog.tsx`, shared create/edit dialog), delete (`useConfirm`, `constraint-violation`
  message) and the child rows (`trip_rate`, composite PK, upsert with `on_conflict: { constraint: trip_rate_pkey, ... }`).
  Dates: `src/lib/dates.ts` (`formatDate`, `formatDateRange`), never `new Date(iso)`.
- Theme: use palette tokens (`color="primary"`, `bgcolor: 'secondary.main'`, `accent` = Arcilla); the hex
  values live only in `src/theme/brand.ts`. Mobile first: test at 390px wide; prefer cards/stacked
  layouts on `xs` over wide tables; forms in a `Dialog` with `fullScreen` on `xs`.
- Unit tests for pure logic go in `src/**/*.test.ts` (vitest, node env, no DOM). No E2E tests.
