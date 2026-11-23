/**
 * The session is the JWT issued by Hapi (POST /auth/login), kept in
 * localStorage so it survives reloads until it expires (12 h by default).
 */
const STORAGE_KEY = 'conkora.session';

export interface Session {
  token: string;
  /** ISO-8601, from the login response. */
  expiresAt: string;
}

/** Reads `exp` (seconds) from a JWT without verifying it; Hasura does the verification. */
export function tokenExpiry(token: string): Date | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? new Date(json.exp * 1000) : null;
  } catch {
    return null;
  }
}

export function isSessionValid(session: Session | null, now: Date = new Date()): session is Session {
  if (!session) return false;
  const expiry = tokenExpiry(session.token);
  return expiry !== null && expiry.getTime() > now.getTime();
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    return isSessionValid(session) ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
