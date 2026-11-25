# Conventions (read this before implementing a slice)

Architecture is fixed by the PRD (issue #1) and ADR-0001/0002. This file says *where things go* and
*how to add them*. Keep it accurate when you change a pattern.

## Layout

```
render.yaml               Render Blueprint for Hapi (production); deploy guide: docs/despliegue.md
.github/workflows/        ci.yml (check + test), deploy-pages.yml (frontend → Pages), hasura-deploy.yml (→ Hasura Cloud)
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
  helpers/fixtures.ts     insertTrip / setGlobalRate / insertExpense … (fixture builders for SQL tests)
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

## Deployment (ADR-0001, `docs/despliegue.md`)

- Frontend → GitHub Pages under `NEXT_PUBLIC_BASE_PATH` (`/conkora-admin-system`). Never hard-code URLs or
  paths: Hasura/Hapi URLs come from `config` (`src/lib/config.ts`, `NEXT_PUBLIC_*` repo variables), files in
  `public/` go through `assetPath()`, `Link`/`router` paths are written without basePath (Next adds it), and
  `window.location` must prefix `config.basePath` (see `redirectToLogin`).
- Hapi → Render (`render.yaml`, free plan sleeps). Calls to Hapi that a user waits on go through
  `fetchWhileWaking` (`src/lib/wake.ts`): retries network/502–504 errors for up to 90 s while the UI says
  "Despertando el servidor…". New backend env var: also add it to `render.yaml` (`sync: false` if secret) and
  to the guide's table.
- Hasura Cloud gets migrations + metadata only from `hasura-deploy.yml` on push to `main` (`hasura/**`);
  the database URL is the env var `PG_DATABASE_URL` (`databases.yaml`). Production CORS origin is
  `https://angelocg97.github.io` (no path) in both `CORS_ORIGIN` (Hapi) and `HASURA_GRAPHQL_CORS_DOMAIN`.

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

## Financial calculations (PRD "Módulo 1", ADR-0002)

- Amounts are stored only in their original currency. Conversion happens **at query time** in SQL views;
  never store converted amounts and never convert in the frontend.
- Rates are **units of the currency per 1 USD** (`numeric(18,6)`); USD is always 1.
- **Effective rate**: `effective_rate(trip_id uuid, currency_code text) → numeric` (migration
  `create_expense`) = `trip_rate.rate` if the Viaje fixes one, else `currency.global_rate`. Pass
  `trip_id = NULL` for General (no Viaje; never call it "Personal"). Every view converts through it:
  - to USD: `amount / effective_rate(trip_id, currency)`
  - Abono to the Pedido's currency: `amount / effective_rate(o.trip_id, p.currency_code) * effective_rate(o.trip_id, o.currency_code)`
    (rates of the **Pedido's** Viaje).
- Outputs: `round(x, 2)` on money columns; `COALESCE(sum(...), 0)` so empty aggregates are `0`, never null.
  For totals, sum the unrounded values and round once at the end (round per row only for per-row columns).
- Existing views: `expense_summary` (`expense_id, trip_id, category, currency_code, rate, amount_usd, is_personal`),
  exposed as the object relationship `expense.summary`. Expense categories are the enum table
  `expense_category` (`flights, lodging, food, car_rental, merchandise, general, other, fuel`; `comment` = Spanish
  label, Hasura returns them in seed order, so `fuel`/Combustible comes last).
- Gasto personal (migration `personal_expenses_and_business_summary`): `expense.is_personal boolean NOT NULL DEFAULT false`,
  independent of category and of the Viaje. It still counts in `expenses_usd` and the Utilidad; `trip_summary` and
  `no_trip_summary` append `personal_expenses_usd` and `business_expenses_usd` (= the two subtotals of `expenses_usd`).
  Fixture: `insertExpense({ isPersonal: true })`.
- `order_summary` (`order_id, customer_id, trip_id, status, currency_code, rate, total, total_usd`; migration
  `create_order_and_items`), exposed as `order.summary`. `total` = Σ price × quantity in the Pedido's currency (0 when
  it has no Artículos), `total_usd` converts with the Viaje's effective rate. It **includes Cancelados**: the
  per-Cliente/Viaje views must filter `status <> 'cancelled'`. `"order"` is a reserved word: always quote it in SQL
  (GraphQL: `order`, `order_by_pk`, `insert_order_one`). Statuses: enum table `order_status` (`pending, delivered, cancelled`).
  Fixtures: `insertOrder`, `insertOrderItem`.
- Abonos: table `payment` (`order_id` CASCADE, `amount > 0`, own `currency_code`, `date`, `notes`; migration
  `create_payment`), `order.payments`. The same migration extends `order_summary` with
  `paid, balance, paid_usd, balance_usd, is_paid` (in the Pedido's currency / USD). Semantics:
  `paid` = Σ Abonos converted with the **Pedido's** Viaje rates (formula above); `paid_usd` = Σ `amount / rate(Abono currency)`;
  `balance` = Saldo = `total − paid` (negative = overpaid); `is_paid` = `total > 0 AND balance <= 0` (the "Pagado" indicator;
  a Pedido without Artículos is neither Pagado nor pendiente). **Rounding rule**: each of `total, total_usd, paid, paid_usd` sums
  unrounded values and is rounded once; `balance`/`balance_usd` subtract the already-rounded values, so Total − Abono = Saldo
  is exact in every view. Aggregates over Pedidos (per Cliente/Viaje) should sum these per-Pedido rounded columns
  (`total_usd`, `paid_usd`, `balance_usd`, excluding `status = 'cancelled'`) so they match what each Pedido shows and stay
  consistent. Fixture: `insertPayment`. Frontend: `pedidos/PaymentDialog.tsx`, `PaymentChip`/`paymentState` (`orders.ts`).
- Cuenta del Cliente (migration `create_customer_summaries`, USD, Cancelados excluded, sums the per-Pedido rounded columns):
  `customer_summary` (`customer_id, order_count, total_usd, paid_usd, balance_usd`; one row per Cliente, zeros/0 when no Pedidos;
  `customer.summary`) and `customer_trip_summary` (`customer_id, trip_id, order_count, total_usd, paid_usd, balance_usd`; one row per
  Cliente and Viaje with non-cancelled Pedidos, `trip_id` null = General; `customer.trip_summaries`, `trip.customer_summaries`,
  `customer_trip_summary.trip`). Frontend: `clientes/AccountFigures.tsx`; account queries use keys `['orders', 'customers' | 'customer-account', ...]`
  so Abono/Pedido mutations (which invalidate `['orders']`) refresh them; the Clientes list sorts by Saldo via
  `order_by: { summary: { balance_usd: desc } }` (`customerOrderBy`).

- Montos en ₡ y $ (issue #30, migration `dual_currency_amounts`): every view with `*_usd` also has `*_crc` (appended at the end),
  converted with `to_crc(trip_id, amount, currency)` = `amount / effective_rate(trip, currency) × effective_rate(trip, 'CRC')`
  (a CRC amount stays as is; Abonos use the Pedido's Viaje; `COALESCE(..., 0)` so it is never null, even without CRC). Same
  rounding as USD: per-row `round(x, 2)`, aggregates sum the per-Pedido/Gasto rounded `*_crc`. Per-record views:
  `expense_summary.amount_crc`, `order_summary.total_crc/paid_crc/balance_crc`, `order_item_summary` (`order_item.summary`:
  `line_total, line_total_usd, line_total_crc`) and `payment_summary` (`payment.summary`: `rate, order_currency_code,
  order_amount, amount_usd, amount_crc`). Frontend: `components/money/DualAmount.tsx` shows the official amount in its currency
  and, muted below, its equivalents (`lib/money.ts` → `equivalentAmounts`/`formatEquivalents`: ₡ → $, $ → ₡, other → ₡ and $);
  for reports/totals pass only `usd` + `crc`. Every money display uses it (or `Figure`/`AccountFigures`, which wrap it).

## Adding a SQL view (financial calculations)

1. `CREATE VIEW` in a new migration (`down.sql`: `DROP VIEW`), converting with `effective_rate` as above.
   Expose the columns frontends filter on (e.g. `trip_id`, `category`) so the same `where` works on the
   table and on the view's `_aggregate`.
2. Track it with a `public_<view>.yaml` (**only** `select_permissions` for `manager`, `allow_aggregations: true`)
   and add relationships from the tables (`manual_configuration` with `remote_table` + `column_mapping`),
   see `public_expense.yaml` → `summary`. Add a case to `tests/hasura/permissions.test.ts`: manager reads
   it, and no `insert_/update_/delete_<view>` mutation exists.
3. Test the numbers in `tests/db/<view>.test.ts` straight against Postgres (the **SQL test harness**):
   `withRollback` gives a pg client inside a transaction that is always rolled back, so tests insert
   fixtures freely, never leave data behind and can run in any order. NUMERIC comes back as JS `number`.
   Build fixtures with `tests/helpers/fixtures.ts` (add builders there for new tables: `insertCustomer`,
   `insertOrder`, …) and pin rates explicitly with `setGlobalRate` / `insertTrip({ rates })` instead of
   relying on seeded values:

   ```ts
   import { withRollback } from '../helpers/db.ts';
   import { insertExpense, insertTrip, setGlobalRate } from '../helpers/fixtures.ts';
   it('Viaje sin tipo para CRC usa el global', () => withRollback(async (db) => {
     await setGlobalRate(db, 'CRC', 500);
     const tripId = await insertTrip(db, { rates: { EUR: 0.9 } });
     const id = await insertExpense(db, { tripId, amount: 25000, currency: 'CRC' });
     const { rows } = await db.query('SELECT amount_usd FROM expense_summary WHERE expense_id = $1', [id]);
     expect(rows[0].amount_usd).toBe(50);
   }));
   ```
   Inside one `withRollback`, a failing statement aborts the transaction: put each expected error in its own test.
4. Run: `scripts/test-integration.sh db/<view>.test.ts` locally (starts the stack, applies migrations);
   CI (`.github/workflows/ci.yml`) runs the whole suite with the same single command, `npm test` (it brings up
   the docker compose stack itself). After adding a migration to a
   running stack, `docker compose restart hasura`.

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
  Dates: `src/lib/dates.ts` (`formatDate`, `formatDateRange`, `todayIso`), never `new Date(iso)`.
- Filtered lists (`gastos/page.tsx`): filters in `useState`, turned into a Hasura `where` by a pure, unit-tested
  helper (`gastos/expenses.ts` → `expenseWhere`, Viaje filter `all | general | trip`, `personal: boolean | null`); query key
  `['expenses', filters]`, mutations invalidate the prefix `['expenses']`. Select options in their own
  query (`['expense-options']`). Enum columns (e.g. `category`) are GraphQL enums: pass the value as a
  string variable (`"merchandise"`), labels come from the enum table's `comment`.
- Text search (`clientes/page.tsx`): a `TextField` in `useState`, turned into `_or` of `_ilike` by a pure helper
  (`clientes/customers.ts` → `customerWhere`, escapes `%`/`_`); query key `['customers', where]` with
  `placeholderData: (prev) => prev` so the list doesn't flash while typing.
- Pedidos (`pedidos/`): `OrderDialog` (create/edit; a new Pedido navigates to its detail; `fixedCustomerId` locks the
  Cliente, `defaultCustomerId`/`defaultTripId` only preselect), `OrderCard` + `ORDER_ROW_FIELDS` (shared list row, also used
  on the Cliente detail), `OrderItemDialog`, filters via `orderWhere`. Shared select options: query key `['order-options']`;
  Pedido lists use the key prefix `['orders']`, the detail `['order', id]`. MUI 9 `Stack` has no system props: put
  `justifyContent`/`alignItems` inside `sx`.
- Reporte por Viaje (`viajes/TripReport.tsx`): SQL views `trip_summary` (one row per Viaje, 0s when empty; `income_usd`, `collected_usd`,
  `pending_usd`, `expenses_usd`, `profit_usd`, `order_count`, `personal_expenses_usd`, `business_expenses_usd`) and `trip_expense_category_summary`, exposed as `trip.summary` /
  `trip.expense_categories`; Clientes of the Viaje via `trip.customer_summaries`. Report queries use keys under `['orders', ...]`;
  Gasto and trip-rate mutations also invalidate `['orders']`.
- Inicio (`(app)/page.tsx`, migration `create_no_trip_summary`): SQL view `no_trip_summary` (same columns as `trip_summary` minus `trip_id`; always one row,
  0s when empty; Pedidos/Gastos with `trip_id IS NULL`, Cancelados excluded). The dashboard shows Saldo total (`customer_summary_aggregate` sum),
  the last 5 Viajes with Utilidad (`trip_summary_aggregate` for the card) and the General Ingreso/Gastos/Saldo.
  Utilidad global: view `business_summary` (one row, 0s when empty; same money columns as `trip_summary` minus `trip_id`) defined as
  Σ (`trip_summary` UNION ALL `no_trip_summary`), so it always equals the sum of the reports; shown at the top of Inicio.
  The label for "no Viaje" is `NO_TRIP_LABEL` = "General" in `lib/terms.ts`: always use it, never hard-code it. "Personal" in the UI
  only ever means Gasto personal.
- Fotos de Artículos (issue #13): `order_item.photo_url` stores only Cloudinary's `secure_url`. Hapi `POST /uploads/signature`
  (`routes/uploads.ts`, JWT checked by hand with `jose`; 503 when `CLOUDINARY_*` are unset) returns a signed payload
  (`cloudName, apiKey, timestamp, folder, signature`; SHA-1 in `uploads/cloudinary.ts`); the browser uploads directly to
  Cloudinary (`lib/photos.ts` → `uploadPhoto`, `thumbnailUrl`). UI: `pedidos/ItemPhoto.tsx` (thumbnail + enlarge) and the photo
  controls in `OrderItemDialog`.
- Theme: use palette tokens (`color="primary"`, `bgcolor: 'secondary.main'`, `accent` = Arcilla); the hex
  values live only in `src/theme/brand.ts`. Mobile first: test at 390px wide; prefer cards/stacked
  layouts on `xs` over wide tables; forms in a `Dialog` with `fullScreen` on `xs`.
- Unit tests for pure logic go in `src/**/*.test.ts` (vitest, node env, no DOM). No E2E tests.
