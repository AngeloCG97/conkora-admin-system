import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasNetworkFailed,
  isOffline,
  reportNetworkFailure,
  reportNetworkSuccess,
  subscribeConnectivity,
} from './connectivity';

describe('connectivity', () => {
  beforeEach(() => reportNetworkSuccess());

  it('is offline when the browser is offline or a request failed at the network level', () => {
    expect(isOffline(true, false)).toBe(false);
    expect(isOffline(false, false)).toBe(true);
    expect(isOffline(true, true)).toBe(true);
  });

  it('notifies subscribers only when the state changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivity(listener);
    reportNetworkFailure();
    reportNetworkFailure();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasNetworkFailed()).toBe(true);
    reportNetworkSuccess();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    reportNetworkFailure();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
