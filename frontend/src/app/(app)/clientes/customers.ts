/** Pure helpers for the Clientes screens (unit tested in customers.test.ts). */

/** Escapes `%`, `_` and `\` so user text is matched literally by `_ilike`. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Hasura `where` for the search box: name or phone contains the text (case-insensitive). Empty = all. */
export function customerWhere(search: string): Record<string, unknown> {
  const term = search.trim();
  if (!term) return {};
  const pattern = `%${escapeLike(term)}%`;
  return { _or: [{ name: { _ilike: pattern } }, { phone: { _ilike: pattern } }] };
}

export type CustomerSort = 'name' | 'balance';

/** Hasura `order_by` for the Clientes list: by name, or by Saldo (USD, highest first; name breaks ties). */
export function customerOrderBy(sort: CustomerSort): Record<string, unknown>[] {
  return sort === 'balance' ? [{ summary: { balance_usd: 'desc' } }, { name: 'asc' }] : [{ name: 'asc' }];
}

export interface SimilarCustomer {
  id: string;
  name: string;
  phone: string | null;
}

export const SIMILAR_CUSTOMERS_QUERY = `query SimilarCustomers($name: String!, $excludeId: uuid) {
  similar_customers(args: { search_name: $name, exclude_id: $excludeId }) { id name phone }
}`;

/**
 * Clientes with an equal or similar name (never the one being edited). The check is only a warning, so if the
 * request fails (or the name is blank) it answers "no matches" and saving goes ahead.
 */
export async function findSimilarCustomers(
  name: string,
  excludeId: string | null,
  request: (name: string, excludeId: string | null) => Promise<SimilarCustomer[]>,
): Promise<SimilarCustomer[]> {
  if (!name.trim()) return [];
  try {
    return await request(name.trim(), excludeId);
  } catch {
    return [];
  }
}
