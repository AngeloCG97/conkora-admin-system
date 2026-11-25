import { describe, expect, it, vi } from 'vitest';
import { customerOrderBy, customerWhere, escapeLike, findSimilarCustomers } from './customers';

describe('customerWhere', () => {
  it('returns no filter for blank search', () => {
    expect(customerWhere('')).toEqual({});
    expect(customerWhere('   ')).toEqual({});
  });

  it('matches name or phone, trimmed', () => {
    expect(customerWhere(' ana ')).toEqual({
      _or: [{ name: { _ilike: '%ana%' } }, { phone: { _ilike: '%ana%' } }],
    });
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_a\\')).toBe('50\\%\\_a\\\\');
    expect(customerWhere('10%')).toEqual({
      _or: [{ name: { _ilike: '%10\\%%' } }, { phone: { _ilike: '%10\\%%' } }],
    });
  });
});

describe('customerOrderBy', () => {
  it('sorts by name or by Saldo descending', () => {
    expect(customerOrderBy('name')).toEqual([{ name: 'asc' }]);
    expect(customerOrderBy('balance')).toEqual([{ summary: { balance_usd: 'desc' } }, { name: 'asc' }]);
  });
});

describe('findSimilarCustomers', () => {
  const match = { id: 'a', name: 'Ana Soto', phone: null };

  it('returns the matches and passes the excluded id', async () => {
    const request = vi.fn().mockResolvedValue([match]);
    expect(await findSimilarCustomers(' Ana Sotto ', 'me', request)).toEqual([match]);
    expect(request).toHaveBeenCalledWith('Ana Sotto', 'me');
  });

  it('does not block saving when the check fails', async () => {
    expect(await findSimilarCustomers('Ana', null, () => Promise.reject(new Error('down')))).toEqual([]);
  });

  it('skips the request for a blank name', async () => {
    const request = vi.fn();
    expect(await findSimilarCustomers('  ', null, request)).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});
