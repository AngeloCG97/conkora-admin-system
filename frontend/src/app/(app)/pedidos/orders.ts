/** Pure helpers for the Pedidos screens (unit tested in orders.test.ts). */
import type { TripFilter } from '../gastos/expenses';

export interface OrderFilters {
  trip: TripFilter;
  /** `customer.id`, or null for every Cliente. */
  customerId: string | null;
  /** `order_status.value`, or null for every state. */
  status: string | null;
}

/** Hasura `where` for the Pedidos list filters. */
export function orderWhere({ trip, customerId, status }: OrderFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (trip.kind === 'personal') where.trip_id = { _is_null: true };
  if (trip.kind === 'trip') where.trip_id = { _eq: trip.id };
  if (customerId) where.customer_id = { _eq: customerId };
  if (status) where.status = { _eq: status };
  return where;
}

/** Parses a typed quantity: a whole number greater than 0 (`3`), otherwise null. */
export function parseQuantity(text: string): number | null {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 && Number.isSafeInteger(value) ? value : null;
}
