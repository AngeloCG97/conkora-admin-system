import { config } from './config';
import { clearSession, saveSession, type Session } from './session';

export class LoginError extends Error {}

/** Calls Hapi's POST /auth/login and stores the session on success. */
export async function login(username: string, password: string): Promise<Session> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new LoginError('No se pudo conectar con el servidor. Intenta de nuevo.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new LoginError(
      response.status === 401 || response.status === 400
        ? (body.message ?? 'Usuario o contraseña incorrectos')
        : 'Ocurrió un error en el servidor. Intenta de nuevo.',
    );
  }

  const session = body as Session;
  saveSession(session);
  return session;
}

/** Clears the session and sends the browser to the login page. */
export function redirectToLogin(): void {
  clearSession();
  if (!window.location.pathname.startsWith(`${config.basePath}/login`)) {
    // Full reload on purpose: called from non-React code and drops all cached query data.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${config.basePath}/login/`);
  }
}
