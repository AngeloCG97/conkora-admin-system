/**
 * "Sin conexión" state. The app is offline when the browser says so (`navigator.onLine`) or when a
 * GraphQL request failed at the network level (no response at all) and nothing has succeeded since.
 * It is deliberately separate from the login's cold-start flow ("Despertando el servidor…"), which
 * only applies while the browser is online and Render's free server is starting.
 */

type Listener = () => void;

let networkFailed = false;
const listeners = new Set<Listener>();

function setNetworkFailed(value: boolean) {
  if (networkFailed === value) return;
  networkFailed = value;
  listeners.forEach((l) => l());
}

export const reportNetworkFailure = () => setNetworkFailed(true);
export const reportNetworkSuccess = () => setNetworkFailed(false);
export const hasNetworkFailed = () => networkFailed;

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isOffline(browserOnline: boolean, failed: boolean): boolean {
  return !browserOnline || failed;
}
