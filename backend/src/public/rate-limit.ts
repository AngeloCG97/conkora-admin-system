/**
 * In-memory token bucket per client IP for the public endpoint (one Render instance, so memory is enough).
 * Each IP gets `capacity` requests at once, refilled continuously at `capacity` per `windowMs`.
 */
export interface RateLimiter {
  /** Takes one token for `key`; false when the bucket is empty. */
  take(key: string): boolean;
}

/** Above this many tracked IPs, buckets that are already full again are dropped. */
const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter({
  capacity,
  windowMs,
  now = Date.now,
}: {
  capacity: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const buckets = new Map<string, { tokens: number; updatedAt: number }>();
  const refillPerMs = capacity / windowMs;

  const refill = (bucket: { tokens: number; updatedAt: number }, at: number) => {
    bucket.tokens = Math.min(capacity, bucket.tokens + (at - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = at;
  };

  const prune = (at: number) => {
    for (const [key, bucket] of buckets) {
      refill(bucket, at);
      if (bucket.tokens >= capacity) buckets.delete(key);
    }
  };

  return {
    take(key) {
      const at = now();
      let bucket = buckets.get(key);
      if (!bucket) {
        if (buckets.size >= MAX_TRACKED_KEYS) prune(at);
        bucket = { tokens: capacity, updatedAt: at };
        buckets.set(key, bucket);
      } else {
        refill(bucket, at);
      }
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
  };
}

/**
 * Client IP behind `trustedProxyHops` reverse proxies (Render: 1). Each proxy appends the address it saw
 * to X-Forwarded-For, so the entry `hops` from the right was written by our own proxy and cannot be
 * forged by the client (entries further left can). With 0 hops the header is ignored.
 */
export function clientIp(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string,
  trustedProxyHops: number,
): string {
  if (trustedProxyHops <= 0 || !forwardedFor) return remoteAddress;
  const entries = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // Fewer entries than proxies: the chain is not what we expect, so trust only the socket.
  return entries[entries.length - trustedProxyHops] ?? remoteAddress;
}
