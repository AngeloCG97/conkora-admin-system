# ConKora · Sistema administrativo

Sistema privado para llevar Viajes, Gastos, Clientes, Ventas, Abonos y Utilidades de ConKora.
Glosario en [`CONTEXT.md`](CONTEXT.md), decisiones en [`docs/adr/`](docs/adr/), convenciones de código en
[`docs/agents/conventions.md`](docs/agents/conventions.md).

| Carpeta     | Qué es                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| `frontend/` | Next.js 16 + MUI 9, exportado como sitio estático (ADR-0001)             |
| `backend/`  | Hapi 21 en Node 24: login (JWT) y salud                                  |
| `hasura/`   | Migraciones SQL y metadata de Hasura v2 (fuente de verdad del esquema)   |
| `tests/`    | Pruebas de integración contra el stack real (Postgres, Hasura y Hapi)    |

## Requisitos

- Node 24 (`nvm use` lee `.nvmrc`)
- Docker con docker compose v2

## Correr en local

```bash
nvm use
npm run setup          # instala dependencias de backend, frontend y tests
npm run stack:up       # Postgres + Hasura (aplica migraciones y metadata) + Hapi
npm run dev            # frontend en http://localhost:3000
```

Entra con el admin inicial: usuario `admin`, contraseña `conkora-dev`
(se crea al arrancar Hapi si no hay ningún admin).

| Servicio        | URL                                     |
| --------------- | --------------------------------------- |
| Frontend        | http://localhost:3000                   |
| Hapi (API)      | http://localhost:4000 (`GET /health`)   |
| Hasura console  | http://localhost:8080 (admin secret `conkora-dev-admin-secret`) |
| Postgres        | `postgres://postgres:postgres@localhost:5432/conkora` |

Todas las variables tienen valores por defecto para desarrollo. Para cambiarlas, copia
`.env.example` a `.env` (stack) o `frontend/.env.example` a `frontend/.env.local` (frontend).

Otros comandos:

```bash
npm run stack:down     # detiene los contenedores (conserva los datos)
npm run stack:reset    # borra la base de datos y vuelve a levantar todo
```

## Desplegar

GitHub Pages + Hasura Cloud + Neon + Render ([ADR-0001](docs/adr/0001-hosting-gratuito-mixto.md)):
guía paso a paso en [`docs/despliegue.md`](docs/despliegue.md).

## Verificar

```bash
npm run check          # lint + typecheck de todo y build estático del frontend
npm test               # pruebas unitarias + de integración (levanta el stack si hace falta)
```
