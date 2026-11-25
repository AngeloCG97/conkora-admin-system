/** Pure helpers for the Pedidos screens (unit tested in requests.test.ts). */
import type { TripFilter } from '../gastos/expenses';
import { orderWhere } from '../ventas/orders';

export interface RequestFilters {
  trip: TripFilter;
  /** `customer.id`, or null for every Cliente. */
  customerId: string | null;
}

/** Hasura `where` for the Pedidos list filters (same Viaje/Cliente filters as the Ventas list, no Estado). */
export function requestWhere({ trip, customerId }: RequestFilters): Record<string, unknown> {
  return orderWhere({ trip, customerId, status: null });
}

/**
 * Hasura `where` of the Ventas a Pedido Artículo can be moved to: Pendientes of the same Cliente and the same
 * Viaje (`tripId` null = General). Only used to preview the target in the dialog: the SQL function
 * `move_request_item_to_order` picks the most recent one (date, then created_at) itself.
 */
export function moveTargetWhere(customerId: string, tripId: string | null): Record<string, unknown> {
  return {
    customer_id: { _eq: customerId },
    trip_id: tripId ? { _eq: tripId } : { _is_null: true },
    status: { _eq: 'pending' },
  };
}

/** "1 Artículo", "3 Artículos", "Sin Artículos". */
export function itemCountLabel(count: number): string {
  if (count === 0) return 'Sin Artículos';
  return count === 1 ? '1 Artículo' : `${count} Artículos`;
}
