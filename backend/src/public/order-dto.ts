import type { HasuraRequest } from '../hasura.ts';

/**
 * Public view of a Venta (issue #35): the only data anyone can read without a session.
 * Every field is picked explicitly from the Hasura row — never spread a row into the DTO — so a new column
 * in the query or the database can never leak. Not included on purpose: ids, Cliente phone/email/notes,
 * Venta/Abono notes, exchange rates, Gastos, other Ventas.
 */

/** Tokens are 24 random bytes as lowercase hex (column default in migration `create_order_share`). */
export const SHARE_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function isShareTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && SHARE_TOKEN_PATTERN.test(token);
}

export interface PublicCurrency {
  code: string;
  symbol: string;
}

export interface PublicOrderItem {
  name: string;
  size: string | null;
  quantity: number;
  price: number;
  lineTotal: number;
  lineTotalUsd: number;
  lineTotalCrc: number;
  photoUrl: string | null;
}

export interface PublicPayment {
  date: string;
  amount: number;
  currency: PublicCurrency;
  /** The Abono converted to the Venta's currency. */
  orderAmount: number;
  amountUsd: number;
  amountCrc: number;
}

export interface PublicOrderTotals {
  total: number;
  totalUsd: number;
  totalCrc: number;
  paid: number;
  paidUsd: number;
  paidCrc: number;
  balance: number;
  balanceUsd: number;
  balanceCrc: number;
}

export interface PublicOrder {
  customerName: string;
  date: string;
  status: string;
  statusLabel: string;
  tripName: string | null;
  currency: PublicCurrency;
  items: PublicOrderItem[];
  payments: PublicPayment[];
  totals: PublicOrderTotals;
}

/** Shape returned by PUBLIC_ORDER_QUERY (admin secret; only what the DTO needs). */
export interface PublicOrderRow {
  status: string;
  date: string;
  customer: { name: string };
  trip: { name: string } | null;
  currency: PublicCurrency;
  summary: {
    total: number;
    total_usd: number;
    total_crc: number;
    paid: number;
    paid_usd: number;
    paid_crc: number;
    balance: number;
    balance_usd: number;
    balance_crc: number;
  } | null;
  items: {
    name: string;
    size: string | null;
    quantity: number;
    price: number;
    photo_url: string | null;
    summary: { line_total: number; line_total_usd: number; line_total_crc: number } | null;
  }[];
  payments: {
    date: string;
    amount: number;
    currency: PublicCurrency;
    summary: { order_amount: number; amount_usd: number; amount_crc: number } | null;
  }[];
}

/** Fixed query; the only variable is the (already validated) token. */
export const PUBLIC_ORDER_QUERY = `query PublicOrder($token: String!) {
  order_share(where: { token: { _eq: $token } }, limit: 1) {
    order {
      status
      date
      customer { name }
      trip { name }
      currency { code symbol }
      summary { total total_usd total_crc paid paid_usd paid_crc balance balance_usd balance_crc }
      items(order_by: [{ created_at: asc }]) {
        name size quantity price photo_url
        summary { line_total line_total_usd line_total_crc }
      }
      payments(order_by: [{ date: asc }, { created_at: asc }]) {
        date amount
        currency { code symbol }
        summary { order_amount amount_usd amount_crc }
      }
    }
  }
  order_status { value comment }
}`;

export const CANCELLED_STATUS = 'cancelled';

const currencyDto = (c: PublicCurrency): PublicCurrency => ({ code: c.code, symbol: c.symbol });

/** Maps a Hasura row to the public DTO; null when the Venta must not be shown (Cancelado). */
export function toPublicOrder(row: PublicOrderRow, statusLabels: Record<string, string>): PublicOrder | null {
  if (row.status === CANCELLED_STATUS) return null;
  const s = row.summary;
  return {
    customerName: row.customer.name,
    date: row.date,
    status: row.status,
    statusLabel: statusLabels[row.status] ?? row.status,
    tripName: row.trip ? row.trip.name : null,
    currency: currencyDto(row.currency),
    items: row.items.map((item) => ({
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.summary?.line_total ?? 0,
      lineTotalUsd: item.summary?.line_total_usd ?? 0,
      lineTotalCrc: item.summary?.line_total_crc ?? 0,
      photoUrl: item.photo_url,
    })),
    payments: row.payments.map((payment) => ({
      date: payment.date,
      amount: payment.amount,
      currency: currencyDto(payment.currency),
      orderAmount: payment.summary?.order_amount ?? 0,
      amountUsd: payment.summary?.amount_usd ?? 0,
      amountCrc: payment.summary?.amount_crc ?? 0,
    })),
    totals: {
      total: s?.total ?? 0,
      totalUsd: s?.total_usd ?? 0,
      totalCrc: s?.total_crc ?? 0,
      paid: s?.paid ?? 0,
      paidUsd: s?.paid_usd ?? 0,
      paidCrc: s?.paid_crc ?? 0,
      balance: s?.balance ?? 0,
      balanceUsd: s?.balance_usd ?? 0,
      balanceCrc: s?.balance_crc ?? 0,
    },
  };
}

/** Persistence port for the public page; swapped for a fake in unit tests. */
export interface PublicOrderStore {
  /** The DTO for a valid, active, non-cancelled link; null otherwise. */
  findByToken(token: string): Promise<PublicOrder | null>;
}

export function hasuraPublicOrderStore(request: HasuraRequest): PublicOrderStore {
  return {
    async findByToken(token) {
      const data = await request<{
        order_share: { order: PublicOrderRow }[];
        order_status: { value: string; comment: string }[];
      }>(PUBLIC_ORDER_QUERY, { token });
      const share = data.order_share[0];
      if (!share) return null;
      const labels = Object.fromEntries(data.order_status.map((s) => [s.value, s.comment]));
      return toPublicOrder(share.order, labels);
    },
  };
}
