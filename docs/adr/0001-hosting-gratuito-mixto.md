# 0001 — Hosting gratuito mixto (GitHub Pages + Hasura Cloud + Neon + Render)

## Estado
Aceptado — 2026-11-22

## Contexto
El stack es Next.js + MUI, Hapi, PostgreSQL y Hasura. Se pidió publicarlo gratis en servicios de Google o GitHub. GitHub Pages solo sirve contenido estático. Google Cloud Run tiene capa gratuita, pero exige una cuenta de facturación con tarjeta. Ninguno de los dos ofrece un Postgres administrado gratuito.

## Decisión
- Frontend: Next.js con `output: 'export'` (estático), desplegado en GitHub Pages con GitHub Actions.
- GraphQL: Hasura Cloud (plan gratuito).
- Base de datos: Neon Postgres (plan gratuito).
- Backend Hapi (login/JWT y lógica que no va en Hasura): Render (plan gratuito).

## Consecuencias
- No se necesita tarjeta, pero hay que crear cuentas en tres proveedores fuera de Google/GitHub.
- El frontend no puede usar funciones de servidor de Next.js (SSR, rutas API, Server Actions): todo va del cliente a Hasura/Hapi.
- En Render, el plan gratuito se duerme cuando no hay tráfico, así que el primer login después de un rato puede tardar unos 30–60 s.
- Migrar luego a Cloud Run es simple: Hapi y Hasura ya van en contenedores.
