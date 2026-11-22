import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange } from './dates';

describe('dates', () => {
  it('formats ISO dates as dd/mm/yyyy', () => {
    expect(formatDate('2026-01-10')).toBe('10/01/2026');
    expect(formatDate('2026-12-31T00:00:00+00:00')).toBe('31/12/2026');
  });
  it('formats a range', () => {
    expect(formatDateRange('2026-01-10', '2026-01-15')).toBe('10/01/2026 – 15/01/2026');
  });
});
