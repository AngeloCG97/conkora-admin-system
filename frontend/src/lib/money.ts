export interface MoneyCurrency {
  code: string;
  symbol: string;
}

/** Display format per currency: thousands separator and decimals. Unknown codes use the `en` style. */
const FORMATS: Record<string, { thousands: string; decimals: number }> = {
  CRC: { thousands: '.', decimals: 0 },
};
const DEFAULT_FORMAT = { thousands: ',', decimals: 2 };

/**
 * Formats an amount with its currency's symbol and style: `$1,250.00`, `₡505.000`.
 * Every screen must use this; never format money inline.
 */
export function formatMoney(amount: number, currency: MoneyCurrency): string {
  const { thousands, decimals } = FORMATS[currency.code] ?? DEFAULT_FORMAT;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [integer, fraction] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const isNegative = amount < 0 && Number(fixed) !== 0;
  return `${isNegative ? '-' : ''}${currency.symbol}${grouped}${fraction ? `.${fraction}` : ''}`;
}
