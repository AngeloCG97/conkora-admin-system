# Guía de despliegue

Cómo publicar el sistema gratis según el [ADR-0001](adr/0001-hosting-gratuito-mixto.md):

| Pieza | Servicio | URL final (ejemplo) |
| --- | --- | --- |
| Frontend (sitio estático) | GitHub Pages | `https://angelocg97.github.io/conkora-admin-system/` |
| GraphQL | Hasura Cloud | `https://<tu-proyecto>.hasura.app/v1/graphql` |
| Base de datos | Neon (Postgres) | `postgresql://…neon.tech/neondb?sslmode=require` |
| API de login (Hapi) | Render | `https://conkora-api.onrender.com` |
| Fotos de Artículos | Cloudinary | (solo credenciales) |

Sigue los pasos **en orden**. Ninguno pide tarjeta de crédito. Ten a mano un archivo de notas
**privado** (no dentro del repo) para ir guardando los valores que copies; al final hay una
[tabla de qué secreto va en qué servicio](#qué-secreto-va-en-qué-servicio).

> Todo lo que diga `<algo>` es un valor tuyo: reemplázalo completo, sin los signos `<` `>`.

---

## 0. Prerrequisitos

Haz esto en una terminal dentro de la carpeta del repo.

1. **Todo el trabajo debe estar en `main`.** Render, GitHub Pages y el workflow de Hasura despliegan
   la rama `main`. Antes de empezar, fusiona los PRs pendientes (incluido el que agrega este archivo).

2. **Darle permiso de workflows al CLI de GitHub.** Los archivos de `.github/workflows/` solo se pueden
   subir con un token que tenga el permiso `workflow`:

   ```bash
   gh auth refresh -s workflow
   ```

   Se abre el navegador (o te da un código para pegar en `https://github.com/login/device`); acepta.
   Después de esto, quien coordina el repo sube los tres workflows (`ci.yml`, `deploy-pages.yml`,
   `hasura-deploy.yml`) en un commit aparte y los fusiona a `main`. Comprueba que existan en
   GitHub → pestaña **Actions** antes de seguir al paso 5.

3. **Revisar que no haya secretos en el repo.** Al hacerlo público, todo su historial queda visible.

   ```bash
   git grep -n -i -E "secret|password|api_key|neon\.tech|hasura\.app|onrender" -- ':!docs/despliegue.md'
   git log --all -p | grep -i -E "neon\.tech|hasura\.app|cloudinary://" | head
   ```

   Lo único que debe aparecer son los valores de **desarrollo local** (`conkora-dev-admin-secret`,
   `conkora-dev-jwt-secret-change-me-…`, `conkora-dev`), que no se usan en producción. Si aparece
   cualquier otra contraseña o URL real, avisa antes de seguir. Nunca subas un archivo `.env`.

4. **Hacer el repo público** (GitHub Pages gratis lo exige):

   ```bash
   gh repo edit AngeloCG97/conkora-admin-system --visibility public --accept-visibility-change-consequences
   ```

   (Por la web: repo → **Settings** → **General** → al final, **Danger Zone** → **Change repository
   visibility** → **Change to public**.)

5. **Generar los secretos fuertes.** Ejecuta este comando **dos veces** y guarda cada resultado en tus
   notas (64 caracteres hexadecimales cada uno):

   ```bash
   openssl rand -hex 32
   ```

   - El primero será **`JWT_SECRET`** (lo comparten Hapi y Hasura; deben ser idénticos).
   - El segundo será **`HASURA_ADMIN_SECRET`** (la llave maestra de Hasura).

   Elige también la **contraseña del admin** de la app (`ADMIN_PASSWORD`): puedes usar
   `openssl rand -base64 18` o una frase larga que recuerdes. El usuario (`ADMIN_USERNAME`) puede ser
   `admin` u otro nombre.

---

## 1. Neon (base de datos Postgres)

1. Entra a `https://neon.tech` → **Sign up** (puedes usar **Continue with GitHub**).
2. Al crear el primer proyecto (o **New Project** en el panel):
   - **Project name**: `conkora`
   - **Postgres version**: 17
   - **Region**: **AWS US East 1 (N. Virginia)** (la misma zona que Render en el paso 4).
   - **Create project**.
3. En el panel del proyecto pulsa **Connect** (arriba a la derecha). En la ventana:
   - **Branch**: `main`, **Database**: `neondb`, **Role**: `neondb_owner`.
   - **Desactiva** el interruptor **Connection pooling**. Hasura necesita la conexión **directa**
     (sin pooler): ya tiene su propio pool, y las migraciones no funcionan bien a través de PgBouncer.
     La URL directa **no** contiene `-pooler` en el host.
   - Copia la cadena que empieza con `postgresql://` (botón **Copy snippet**; si muestra la
     contraseña oculta, pulsa **Show password** antes). Debe terminar en `?sslmode=require`
     (puede traer también `&channel_binding=require`; está bien).
4. Guárdala en tus notas como **`PG_DATABASE_URL`**.

---

## 2. Hasura Cloud (GraphQL)

1. Entra a `https://cloud.hasura.io` → **Sign up** (puedes usar GitHub).
2. **New Project** → plan **Free** → elige región **AWS – US East** (o la más cercana a Virginia
   que ofrezca) → **Create Project**. Si te pregunta la versión del motor, elige **v2**.
3. En la página del proyecto (ícono de engranaje / **Settings**) anota:
   - **GraphQL API**: algo como `https://<tu-proyecto>.hasura.app/v1/graphql`. Guárdalo en tus notas
     como **`HASURA_GRAPHQL_URL`**. La misma URL **sin** `/v1/graphql` es **`HASURA_ENDPOINT`**.
4. Abre la pestaña **Env vars** y, con **+ New Env Var**, crea (o edita si ya existe) cada una de
   estas variables. En **Key** escribe el nombre exacto; en **Value** pega el valor:

   | Key | Value |
   | --- | --- |
   | `PG_DATABASE_URL` | la cadena **directa** de Neon del paso 1 |
   | `HASURA_GRAPHQL_ADMIN_SECRET` | tu `HASURA_ADMIN_SECRET` (reemplaza el que Hasura generó) |
   | `HASURA_GRAPHQL_JWT_SECRET` | `{"type":"HS256","key":"<JWT_SECRET>"}` |
   | `HASURA_GRAPHQL_CORS_DOMAIN` | `https://angelocg97.github.io` |
   | `HASURA_GRAPHQL_DEV_MODE` | `false` |
   | `HASURA_GRAPHQL_ENABLE_CONSOLE` | `false` |

   Detalles importantes:
   - `PG_DATABASE_URL` es el nombre que usa la metadata del repo
     (`hasura/metadata/databases/databases.yaml` → `from_env: PG_DATABASE_URL`). **No** conectes la
     base a mano desde la pestaña **Data** de la consola: el workflow del paso 5 la registra solo.
   - En `HASURA_GRAPHQL_JWT_SECRET` copia el JSON tal cual, con las comillas dobles, reemplazando solo
     `<JWT_SECRET>`. Ejemplo con un secreto inventado:
     `{"type":"HS256","key":"3f9a…c41e"}` (sin espacios extra ni saltos de línea).
   - `HASURA_GRAPHQL_CORS_DOMAIN` es el **origen** de GitHub Pages: sin la ruta
     `/conkora-admin-system` y sin `/` al final.
   - `DEV_MODE=false` evita que los errores muestren detalles internos. En Hasura Cloud la consola se
     abre desde **Launch Console** con el admin secret; `ENABLE_CONSOLE=false` solo apaga la consola
     servida por el propio motor.
5. Pulsa **Save** / aplica los cambios; el proyecto se reinicia en unos segundos.

Todavía no hay tablas: se crean en el paso 5 con el workflow `hasura-deploy`.

---

## 3. Cloudinary (fotos de Artículos)

Las credenciales solo van en Hapi (Render), nunca en el frontend. Se usan para las fotos de Artículos
(issue #13); puedes cargarlas desde ya.

1. Entra a `https://cloudinary.com` → **Sign up for free**.
2. Ya dentro, abre **Settings** (engranaje, abajo a la izquierda) → **API Keys**. También aparecen en
   el **Dashboard** / **Programmable Media** → **Product Environment Credentials**.
3. Copia a tus notas:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** (pulsa el ojo para verlo) → `CLOUDINARY_API_SECRET`

---

## 4. Render (API Hapi)

El archivo [`render.yaml`](../render.yaml) del repo describe el servicio (plan gratis, Node 24,
health check en `/health`, carpeta `backend/`, se redespliega con cada commit en `main` que toque
`backend/`).

1. Entra a `https://render.com` → **Get Started** → **GitHub** (así Render puede leer el repo).
2. En el panel: **+ New** → **Blueprint**.
3. **Connect a repository**: elige `AngeloCG97/conkora-admin-system` (si no aparece, pulsa
   **Configure account** / **Configure GitHub** y dale acceso a ese repo) → **Connect**.
4. **Blueprint Name**: `conkora`. **Branch**: `main`. Render lee `render.yaml` y muestra el servicio
   `conkora-api`.
5. Te pide los valores de las variables marcadas como secretas. Llena cada campo así:

   | Variable | Valor |
   | --- | --- |
   | `JWT_SECRET` | tu `JWT_SECRET` (el **mismo** que pusiste dentro del JSON de Hasura) |
   | `HASURA_ADMIN_SECRET` | tu `HASURA_ADMIN_SECRET` |
   | `HASURA_GRAPHQL_URL` | `https://<tu-proyecto>.hasura.app/v1/graphql` (con `/v1/graphql`) |
   | `ADMIN_USERNAME` | el usuario del admin, p. ej. `admin` |
   | `ADMIN_PASSWORD` | la contraseña del admin |
   | `CORS_ORIGIN` | `https://angelocg97.github.io` (sin ruta ni `/` final) |
   | `JWT_EXPIRES_IN_SECONDS` | `43200` (la sesión dura 12 h) |
   | `CLOUDINARY_CLOUD_NAME` | el Cloud name |
   | `CLOUDINARY_API_KEY` | la API Key |
   | `CLOUDINARY_API_SECRET` | la API Secret |

   `NODE_VERSION`, `NODE_ENV`, `TRUSTED_PROXY_HOPS` (`1`: el proxy de Render, para el límite de peticiones de
   la página pública de la Venta) y `PORT` ya vienen dados; no los toques.
6. **Deploy Blueprint** (o **Apply**). Render instala dependencias y arranca.
7. Abre el servicio `conkora-api` y copia su URL (arriba, debajo del nombre), p. ej.
   `https://conkora-api.onrender.com`. Guárdala como **`NEXT_PUBLIC_API_URL`** (sin `/` final).

> El admin inicial se crea **una sola vez**, cuando Hapi arranca y no hay ningún admin. Cambiar
> `ADMIN_PASSWORD` después no cambia la contraseña de un admin que ya existe.

> Si este primer despliegue falla con un error sobre `admin_user` o termina en *Deploy failed*, es
> normal: las tablas aún no existen. Se arregla en el paso 5.5.

---

## 5. GitHub (secretos, variables, Pages y workflows)

Ve al repo en GitHub → **Settings** → **Secrets and variables** → **Actions**.

1. Pestaña **Secrets** → **New repository secret** (uno por fila):

   | Name | Secret |
   | --- | --- |
   | `HASURA_ENDPOINT` | `https://<tu-proyecto>.hasura.app` (**sin** `/v1/graphql`) |
   | `HASURA_ADMIN_SECRET` | tu `HASURA_ADMIN_SECRET` |

2. Pestaña **Variables** → **New repository variable**:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_HASURA_GRAPHQL_URL` | `https://<tu-proyecto>.hasura.app/v1/graphql` |
   | `NEXT_PUBLIC_API_URL` | `https://conkora-api.onrender.com` (tu URL de Render, sin `/` final) |
   | `NEXT_PUBLIC_BASE_PATH` | `/conkora-admin-system` (opcional: si no existe se usa la ruta que da Pages) |

   Las variables `NEXT_PUBLIC_*` quedan visibles en el sitio publicado: ahí **nunca** va un secreto.

   **Alternativa por terminal** (hace lo mismo que 1 y 2; `gh secret set` sin `--body` te pide el
   valor sin mostrarlo):

   ```bash
   gh secret set HASURA_ENDPOINT --body "https://<tu-proyecto>.hasura.app"
   gh secret set HASURA_ADMIN_SECRET
   gh variable set NEXT_PUBLIC_HASURA_GRAPHQL_URL --body "https://<tu-proyecto>.hasura.app/v1/graphql"
   gh variable set NEXT_PUBLIC_API_URL --body "https://conkora-api.onrender.com"
   gh variable set NEXT_PUBLIC_BASE_PATH --body "/conkora-admin-system"
   ```

3. **Activar Pages**: **Settings** → **Pages** → **Build and deployment** → **Source**:
   **GitHub Actions**. (Por terminal:
   `gh api -X POST repos/AngeloCG97/conkora-admin-system/pages -f build_type=workflow`.)

4. **Crear las tablas en Hasura Cloud**: pestaña **Actions** → workflow
   **Deploy Hasura migrations and metadata** → **Run workflow** → rama `main` → **Run workflow**.
   Debe terminar en verde. (Terminal: `gh workflow run hasura-deploy.yml --ref main` y luego
   `gh run watch`.)

   En la primera corrida el primer `metadata apply` avisa de inconsistencias (las tablas aún no
   existen): es esperado. El último paso falla solo si algo quedó inconsistente al final.

5. **Redesplegar Hapi** si falló en el paso 4: en Render → `conkora-api` → **Manual Deploy** →
   **Deploy latest commit**. En **Logs** debe aparecer `Created initial admin "<usuario>"` y
   `API listening on …`.

6. **Publicar el frontend**: **Actions** → **Deploy frontend to GitHub Pages** → **Run workflow** →
   `main`. (Terminal: `gh workflow run deploy-pages.yml --ref main`.) Al terminar, el job `deploy`
   muestra la URL `https://angelocg97.github.io/conkora-admin-system/`.

De aquí en adelante todo es automático (ver paso 7).

---

## 6. Verificación de punta a punta

1. **Hapi vivo**: abre `https://conkora-api.onrender.com/health` → debe responder `{"status":"ok"}`
   (la primera vez puede tardar hasta un minuto si estaba dormido).
2. **Hasura con permisos**: en `https://cloud.hasura.io` → tu proyecto → **Launch Console** → **Data**:
   deben aparecer las tablas (`trip`, `expense`, `customer`, `order`…) sin avisos de inconsistencia.
3. **Login**: abre `https://angelocg97.github.io/conkora-admin-system/`. Debe verse el logo y el
   formulario. Entra con `ADMIN_USERNAME` / `ADMIN_PASSWORD` → llegas a **Inicio** con los montos en 0.
4. **Datos**: crea un Viaje de prueba, recarga la página (F5) y comprueba que sigue ahí; luego bórralo.
5. **Arranque en frío**: espera unos 20 minutos sin usar la app (Render duerme el servicio tras 15 min
   sin tráfico), cierra sesión y vuelve a entrar. Debe aparecer el aviso
   **"Despertando el servidor…"** con una barra de progreso y, en menos de un minuto, entrar normal,
   sin mensaje de error.

---

## 7. Cómo redesplegar y solución de problemas

### Redesplegar

Todo se redespliega solo al fusionar a `main`:

| Cambia… | Se redespliega con… |
| --- | --- |
| `frontend/**` | workflow **Deploy frontend to GitHub Pages** |
| `hasura/**` (migraciones o metadata) | workflow **Deploy Hasura migrations and metadata** |
| `backend/**` | Render (autodeploy por commit) |

A mano: **Actions** → el workflow → **Run workflow**, o en Render **Manual Deploy**. Si cambias una
variable `NEXT_PUBLIC_*`, vuelve a correr **Deploy frontend to GitHub Pages** (se incrustan al
compilar). Si cambias un valor en Render o Hasura Cloud, ellos se reinician solos al guardar.

**Rotar `JWT_SECRET`**: cámbialo a la vez en Render (`JWT_SECRET`) y en Hasura Cloud (dentro del JSON
de `HASURA_GRAPHQL_JWT_SECRET`). Las sesiones abiertas se cierran y hay que volver a entrar.
**Rotar `HASURA_ADMIN_SECRET`**: Hasura Cloud (`HASURA_GRAPHQL_ADMIN_SECRET`), Render
(`HASURA_ADMIN_SECRET`) y el secreto del repo (`HASURA_ADMIN_SECRET`).

### Problemas comunes

- **El login dice "El servidor no respondió" o la consola del navegador (F12) muestra un error de
  CORS hacia `onrender.com`**: revisa en Render que `CORS_ORIGIN` sea exactamente
  `https://angelocg97.github.io` (sin ruta, sin `/` final, con `https`). Si el servicio está caído,
  mira **Logs** en Render: un `Missing required environment variable …` indica cuál falta, y
  `JWT_SECRET must be at least 32 characters` que el secreto es muy corto.
- **Error de CORS hacia `hasura.app`**: revisa `HASURA_GRAPHQL_CORS_DOMAIN` en Hasura Cloud (mismo
  valor que arriba).
- **Entra pero de inmediato vuelve al login, o Hasura responde `invalid-jwt` /
  `JWTInvalidSignature`**: el `JWT_SECRET` de Render y el `key` dentro de `HASURA_GRAPHQL_JWT_SECRET`
  no son idénticos, o el JSON está mal escrito (comillas tipográficas, espacios, falta `"type":"HS256"`).
  Corrígelo, espera el reinicio y entra de nuevo.
- **"Usuario o contraseña incorrectos" con los datos correctos**: el admin se creó en un arranque
  anterior con otra contraseña. Puedes borrar la fila de `admin_user` desde la consola de Hasura
  (**Data** → `admin_user`) y redesplegar Hapi para que lo cree de nuevo con los valores actuales.
- **El primer login tarda mucho**: es Render dormido (plan gratis). La app reintenta hasta 90 s
  mostrando "Despertando el servidor…". Si se agota, espera unos segundos y vuelve a intentar.
- **GitHub Pages muestra 404, o la página sale sin estilos ni logo**: casi siempre es el `basePath`.
  - La URL correcta lleva la ruta del repo y `/` final: `https://angelocg97.github.io/conkora-admin-system/`.
  - Si definiste `NEXT_PUBLIC_BASE_PATH`, debe ser `/conkora-admin-system` (con `/` inicial, sin `/`
    final, mismo nombre exacto del repo). Corrige y vuelve a correr el workflow de Pages.
  - **Settings** → **Pages** → **Source** debe ser **GitHub Actions** (no "Deploy from a branch").
- **El workflow de Pages falla con "Missing repository variable"**: falta
  `NEXT_PUBLIC_HASURA_GRAPHQL_URL` o `NEXT_PUBLIC_API_URL` (paso 5.2).
- **El job `deploy` de Pages falla con "Branch … is not allowed to deploy to github-pages"**: solo se
  publica desde `main`; corre el workflow sobre `main`.
- **El workflow de Hasura falla**:
  - `Missing secrets HASURA_ENDPOINT / HASURA_ADMIN_SECRET` → paso 5.1.
  - `invalid x-hasura-admin-secret` / `access-denied` → el secreto del repo no coincide con
    `HASURA_GRAPHQL_ADMIN_SECRET` de Hasura Cloud.
  - Error de conexión a la base / `PG_DATABASE_URL` → revisa la variable en Hasura Cloud (paso 2.4) y
    que sea la cadena **directa** de Neon.
  - `inconsistent` en el último paso → abre **Launch Console** → **Settings** → **Metadata Status**
    para ver qué objeto falla.
- **Neon "suspende" la base**: en el plan gratis la base se pausa sin uso y despierta sola en la
  primera consulta (tarda menos de un segundo); no hay que hacer nada.

---

## Qué secreto va en qué servicio

| Valor | Hasura Cloud (Env vars) | Render (`conkora-api`) | GitHub (Actions) |
| --- | --- | --- | --- |
| Cadena directa de Neon | `PG_DATABASE_URL` | — | — |
| `HASURA_ADMIN_SECRET` (`openssl rand -hex 32`) | `HASURA_GRAPHQL_ADMIN_SECRET` | `HASURA_ADMIN_SECRET` | secreto `HASURA_ADMIN_SECRET` |
| `JWT_SECRET` (`openssl rand -hex 32`) | dentro de `HASURA_GRAPHQL_JWT_SECRET`: `{"type":"HS256","key":"<JWT_SECRET>"}` | `JWT_SECRET` | — |
| Origen de Pages `https://angelocg97.github.io` | `HASURA_GRAPHQL_CORS_DOMAIN` | `CORS_ORIGIN` | — |
| `https://<proyecto>.hasura.app` | — | — | secreto `HASURA_ENDPOINT` |
| `https://<proyecto>.hasura.app/v1/graphql` | — | `HASURA_GRAPHQL_URL` | variable `NEXT_PUBLIC_HASURA_GRAPHQL_URL` |
| URL de Render | — | — | variable `NEXT_PUBLIC_API_URL` |
| `/conkora-admin-system` | — | — | variable `NEXT_PUBLIC_BASE_PATH` (opcional) |
| Usuario y contraseña del admin | — | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | — |
| Duración de la sesión (`43200`) | — | `JWT_EXPIRES_IN_SECONDS` | — |
| Credenciales de Cloudinary | — | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | — |
| Proxies delante de Hapi (`1`, ya en `render.yaml`) | — | `TRUSTED_PROXY_HOPS` | — |
| `false` | `HASURA_GRAPHQL_DEV_MODE`, `HASURA_GRAPHQL_ENABLE_CONSOLE` | — | — |
