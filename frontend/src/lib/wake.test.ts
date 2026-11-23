import { describe, expect, it, vi } from 'vitest';
import { ServerWakeTimeoutError, fetchWhileWaking } from './wake';

/** Fake clock: `sleep` advances time instantly. */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const ok = () => new Response('{}', { status: 200 });

describe('fetchWhileWaking', () => {
  it('returns the first response when the server is awake', async () => {
    const request = vi.fn().mockResolvedValue(ok());
    const onRetry = vi.fn();
    const response = await fetchWhileWaking(request, { ...fakeClock(), onRetry });
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries network errors and gateway statuses until the server answers', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValue(ok());
    const onRetry = vi.fn();
    const response = await fetchWhileWaking(request, { ...fakeClock(), onRetry, retryDelayMs: 1000 });
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(4);
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it('does not retry application errors such as 401', async () => {
    const request = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const response = await fetchWhileWaking(request, fakeClock());
    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('gives up with ServerWakeTimeoutError after the deadline', async () => {
    const clock = fakeClock();
    const request = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      fetchWhileWaking(request, { ...clock, deadlineMs: 10_000, retryDelayMs: 3_000 }),
    ).rejects.toBeInstanceOf(ServerWakeTimeoutError);
    // attempts at 0 s, 3 s, 6 s and 9 s; no time left for another pause
    expect(request).toHaveBeenCalledTimes(4);
    expect(clock.now()).toBeLessThanOrEqual(10_000);
  });

  it('gives up when a hanging request uses up the deadline', async () => {
    const clock = fakeClock();
    const request = vi.fn().mockImplementation(async () => {
      clock.advance(90_000);
      throw new DOMException('timed out', 'TimeoutError');
    });
    await expect(fetchWhileWaking(request, clock)).rejects.toBeInstanceOf(ServerWakeTimeoutError);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
