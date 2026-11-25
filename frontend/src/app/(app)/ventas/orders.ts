/** Pure helpers for the Ventas screens (unit tested in orders.test.ts). */
import { parseAmount, type TripFilter } from '../gastos/expenses';

export interface OrderFilters {
  trip: TripFilter;
  /** `customer.id`, or null for every Cliente. */
  customerId: string | null;
  /** `order_status.value`, or null for every state. */
  status: string | null;
}

/** Hasura `where` for the Ventas list filters. */
export function orderWhere({ trip, customerId, status }: OrderFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (trip.kind === 'general') where.trip_id = { _is_null: true };
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

/** Parses a typed Abono amount: like `parseAmount` (up to 2 decimals) but strictly greater than 0. */
export function parsePaymentAmount(text: string): number | null {
  const value = parseAmount(text);
  return value !== null && value > 0 ? value : null;
}

export type PaymentState = 'paid' | 'pending' | null;

/**
 * Payment indicator of a Venta, derived from the Saldo computed by `order_summary` (never set by hand):
 * "Pagado" when `is_paid`, "Saldo pendiente" while the Saldo is positive, nothing for a Cancelado or an empty Venta.
 */
export function paymentState(status: string, summary: { balance: number; is_paid: boolean } | null): PaymentState {
  if (status === 'cancelled' || !summary) return null;
  if (summary.is_paid) return 'paid';
  return summary.balance > 0 ? 'pending' : null;
}
