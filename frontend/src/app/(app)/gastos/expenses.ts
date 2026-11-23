/** Pure helpers for the Gastos screens (unit tested in expenses.test.ts). */

/** Viaje filter: every Gasto, only General ones (no Viaje), or one Viaje by id. */
export type TripFilter = { kind: 'all' } | { kind: 'general' } | { kind: 'trip'; id: string };

export interface ExpenseFilters {
  trip: TripFilter;
  /** `expense_category.value`, or null for every category. */
  category: string | null;
  /** true = only Gastos personales, false = only Gastos del negocio, null = both. */
  personal: boolean | null;
}

/**
 * Hasura `where` for the filters. Works for both `expense` and `expense_summary`,
 * which share the `trip_id`, `category` and `is_personal` columns.
 */
export function expenseWhere({ trip, category, personal }: ExpenseFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (trip.kind === 'general') where.trip_id = { _is_null: true };
  if (trip.kind === 'trip') where.trip_id = { _eq: trip.id };
  if (category) where.category = { _eq: category };
  if (personal !== null) where.is_personal = { _eq: personal };
  return where;
}

/** Parses a typed amount (`1250.5`, `1250,50`). Returns null unless it is a number ≥ 0 with at most 2 decimals. */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
