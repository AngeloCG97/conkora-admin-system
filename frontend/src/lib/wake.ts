/**
 * Cold start of the API (ADR-0001): Render's free plan puts Hapi to sleep when idle and the
 * first request after that takes 30–60 s. Meanwhile the request may hang, fail at the network
 * level (Render's 502/503 page has no CORS headers, so the browser reports a network error) or
 * come back as a gateway error. `fetchWhileWaking` retries those cases until a generous deadline
 * instead of showing an error right away.
 */

/** Total time we keep trying before giving up (Render usually wakes in under a minute). */
export const WAKE_DEADLINE_MS = 90_000;
/** Pause between attempts after a network or gateway error. */
export const WAKE_RETRY_DELAY_MS = 3_000;

/** Gateway statuses Render returns while the service is starting. */
const WAKING_STATUSES = new Set([502, 503, 504]);

export class ServerWakeTimeoutError extends Error {
  constructor() {
    super('El servidor no respondió a tiempo');
  }
}

export interface WakeOptions {
  deadlineMs?: number;
  retryDelayMs?: number;
  /** Called once per retry, so the UI can switch to "despertando el servidor…". */
  onRetry?: () => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `request(signal)` until it returns a response that is not a gateway error.
 * `signal` aborts when the deadline passes. Throws ServerWakeTimeoutError if it never answers.
 */
export async function fetchWhileWaking(
  request: (signal: AbortSignal) => Promise<Response>,
  {
    deadlineMs = WAKE_DEADLINE_MS,
    retryDelayMs = WAKE_RETRY_DELAY_MS,
    onRetry,
    now = Date.now,
    sleep = defaultSleep,
  }: WakeOptions = {},
): Promise<Response> {
  const deadline = now() + deadlineMs;
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new ServerWakeTimeoutError();
    try {
      const response = await request(AbortSignal.timeout(remaining));
      if (!WAKING_STATUSES.has(response.status)) return response;
    } catch {
      // network error or timeout: the server is probably still waking up
    }
    if (deadline - now() <= retryDelayMs) throw new ServerWakeTimeoutError();
    onRetry?.();
    await sleep(retryDelayMs);
  }
}

/** Fire-and-forget request that starts waking the API while the user types. */
export function wakeServer(apiUrl: string): void {
  fetch(`${apiUrl}/health`, { cache: 'no-store' }).catch(() => {
    // ignored: login retries on its own
  });
}
