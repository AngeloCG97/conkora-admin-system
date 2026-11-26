/** Pure helpers for the Inventario screens (unit tested in inventory.test.ts). */
import { CRC, USD, formatMoney } from '@/lib/money';
import { escapeLike } from '../clientes/customers';
import { parseQuantity } from '../ventas/orders';

/** Disponibles (cantidad > 0, the default), Agotados (cantidad = 0) or both. */
export type Availability = 'available' | 'sold_out' | 'all';

export interface StockFilters {
  availability: Availability;
  /** `item_gender.value`, or null for every género. */
  gender: string | null;
  /** Free text matched against the name. */
  search: string;
}

export const DEFAULT_STOCK_FILTERS: StockFilters = { availability: 'available', gender: null, search: '' };

/** Hasura `where` for the Inventario list filters. */
export function stockWhere({ availability, gender, search }: StockFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (availability === 'available') where.quantity = { _gt: 0 };
  if (availability === 'sold_out') where.quantity = { _eq: 0 };
  if (gender) where.gender = { _eq: gender };
  const term = search.trim();
  if (term) where.name = { _ilike: `%${escapeLike(term)}%` };
  return where;
}

/** Parses a typed stock quantity: a whole number ≥ 0 (`0` = Agotado), otherwise null. */
export function parseStockQuantity(text: string): number | null {
  if (text.trim() === '0') return 0;
  return parseQuantity(text);
}

/** Parses the quantity to sell: a whole number from 1 to `stock`, otherwise null. */
export function parseSaleQuantity(text: string, stock: number): number | null {
  const value = parseQuantity(text);
  return value !== null && value <= stock ? value : null;
}

/**
 * Initial unit price of the "Vender" dialog: the Artículo's price only when the target Venta is in the same
 * currency (the frontend never converts money); otherwise empty so it is typed in the Venta's currency.
 */
export function initialSalePrice(price: number, itemCurrency: string, targetCurrency: string): string {
  return itemCurrency === targetCurrency ? String(price) : '';
}

/**
 * Secondary line of the Utilidad proyectada KPI (values from `projected_profit_summary`, display only):
 * "Utilidad actual ₡35.000 ($70.00) + Inventario disponible ₡14.000 ($30.00)".
 */
export function projectedProfitBreakdown(p: {
  profit_usd: number;
  profit_crc: number;
  stock_value_usd: number;
  stock_value_crc: number;
}): string {
  const both = (crc: number, usd: number) => `${formatMoney(crc, CRC)} (${formatMoney(usd, USD)})`;
  return `Utilidad actual ${both(p.profit_crc, p.profit_usd)} + Inventario disponible ${both(p.stock_value_crc, p.stock_value_usd)}`;
}

/** "3 disponibles", "1 disponible", "Agotado". */
export function stockLabel(quantity: number): string {
  if (quantity === 0) return 'Agotado';
  return quantity === 1 ? '1 disponible' : `${quantity} disponibles`;
}
