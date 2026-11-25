import Box from '@mui/material/Box';
import type { ElementType } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import { USD, formatEquivalents, formatMoney, type MoneyCurrency } from '@/lib/money';

/**
 * An amount in ₡ and $ (issue #30). The official amount goes first, in its currency; below it, muted, its
 * equivalents: ₡ → $, $ → ₡, other currency → ₡ and $. Without `amount`/`currency` the official amount is the
 * USD one (reports and totals), so it shows $ and then ₡. Display only: every value comes from a SQL view.
 */
export function DualAmount({
  amount,
  currency = USD,
  usd,
  crc,
  label,
  variant = 'body1',
  component,
  fontWeight = 600,
  color,
  align,
  sx,
}: {
  /** Official amount in `currency` (defaults to `usd`). */
  amount?: number;
  currency?: MoneyCurrency;
  usd: number;
  crc: number;
  /** Text before the official amount, e.g. "Saldo". */
  label?: string;
  variant?: TypographyProps['variant'];
  component?: ElementType;
  fontWeight?: number;
  /** Color of the official amount (the equivalents stay muted). */
  color?: string;
  align?: 'left' | 'right';
  sx?: SxProps<Theme>;
}) {
  const official = amount ?? usd;
  return (
    <Box sx={{ textAlign: align, minWidth: 0, ...sx }}>
      <Typography variant={variant} component={component ?? 'p'} sx={{ fontWeight, color }}>
        {label ? `${label} ` : ''}
        {formatMoney(official, currency)}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.3 }}>
        {formatEquivalents(currency.code, { usd, crc })}
      </Typography>
    </Box>
  );
}
