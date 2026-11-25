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
 * Which equivalents to show next to an amount registered in `currencyCode`:
 * ₡ → $, $ → ₡, any other currency → ₡ and $. Display only: the values come from the views.
 */
export function equivalentAmounts(currencyCode: string, { usd, crc }: Equivalents): { amount: number; currency: MoneyCurrency }[] {
  if (currencyCode === CRC.code) return [{ amount: usd, currency: USD }];
  if (currencyCode === USD.code) return [{ amount: crc, currency: CRC }];
  return [
    { amount: crc, currency: CRC },
    { amount: usd, currency: USD },
  ];
}

/** Muted line shown under an official amount, e.g. `≈ ₡52.000` or `≈ ₡26.000 · $50.00`. */
export function formatEquivalents(currencyCode: string, equivalents: Equivalents): string {
  return `≈ ${equivalentAmounts(currencyCode, equivalents)
    .map((e) => formatMoney(e.amount, e.currency))
    .join(' · ')}`;
}
