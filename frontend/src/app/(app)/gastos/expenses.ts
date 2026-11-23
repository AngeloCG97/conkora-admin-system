/** Pure helpers for the Gastos screens (unit tested in expenses.test.ts). */

/** Viaje filter: every Gasto, only Personal ones (no Viaje), or one Viaje by id. */
export type TripFilter = { kind: 'all' } | { kind: 'personal' } | { kind: 'trip'; id: string };

export interface ExpenseFilters {
  trip: TripFilter;
  /** `expense_category.value`, or null for every category. */
  category: string | null;
}

/**
 * Hasura `where` for the filters. Works for both `expense` and `expense_summary`,
 * which share the `trip_id` and `category` columns.
 */
export function expenseWhere({ trip, category }: ExpenseFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (trip.kind === 'personal') where.trip_id = { _is_null: true };
  if (trip.kind === 'trip') where.trip_id = { _eq: trip.id };
  if (category) where.category = { _eq: category };
  return where;
}

/** Parses a typed amount (`1250.5`, `1250,50`). Returns null unless it is a number ≥ 0 with at most 2 decimals. */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
