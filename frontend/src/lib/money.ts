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

/** The two currencies every amount is shown in (issue #30). */
export const USD: MoneyCurrency = { code: 'USD', symbol: '$' };
export const CRC: MoneyCurrency = { code: 'CRC', symbol: '₡' };

/** ₡ and $ equivalents of an amount, as computed by the SQL views (`*_crc`, `*_usd`). */
export interface Equivalents {
  usd: number;
  crc: number;
}

/**
 * Lines of a dual amount: ₡ is ALWAYS the primary (prominent) figure and $ the secondary one, whatever
 * currency the amount was registered in. The registered amount stays the official one: it is shown as-is,
 * the other figures carry `≈` (computed by the SQL views). Another currency (e.g. EUR) shows its own
 * official amount and then `≈ $`. Display only: every value comes from the views.
 */
export function dualAmountLines(
  currency: MoneyCurrency,
  official: number,
  { usd, crc }: Equivalents,
): { primary: string; secondary: string } {
  if (currency.code === CRC.code) return { primary: formatMoney(official, CRC), secondary: `≈ ${formatMoney(usd, USD)}` };
  if (currency.code === USD.code) return { primary: formatMoney(crc, CRC), secondary: formatMoney(official, USD) };
  return { primary: formatMoney(crc, CRC), secondary: `${formatMoney(official, currency)} · ≈ ${formatMoney(usd, USD)}` };
}
