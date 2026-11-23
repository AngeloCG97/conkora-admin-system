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
