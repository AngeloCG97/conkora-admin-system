import { describe, expect, it } from 'vitest';
import { customerWhere, escapeLike } from './customers';

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
