import Box from '@mui/material/Box';
import type { ElementType } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import { USD, dualAmountLines, type MoneyCurrency } from '@/lib/money';

/**
 * An amount in ₡ and $ (issue #30). Colones are ALWAYS the primary (big) figure and dólares the secondary one
 * (below, muted), whatever currency it was registered in; the registered amount stays the official one and the
 * other is computed by the SQL views (see `dualAmountLines`). Without `amount`/`currency` the official amount is
 * the USD one (reports and totals). Display only: every value comes from a SQL view.
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
  /** Registered (official) amount in `currency` (defaults to `usd`). */
  amount?: number;
  currency?: MoneyCurrency;
  usd: number;
  crc: number;
  /** Text before the primary amount, e.g. "Saldo". */
  label?: string;
  variant?: TypographyProps['variant'];
  component?: ElementType;
  fontWeight?: number;
  /** Color of the primary amount (the secondary line stays muted). */
  color?: string;
  align?: 'left' | 'right';
  sx?: SxProps<Theme>;
}) {
  const lines = dualAmountLines(currency, amount ?? usd, { usd, crc });
  return (
    <Box sx={{ textAlign: align, minWidth: 0, ...sx }}>
      <Typography variant={variant} component={component ?? 'p'} sx={{
          fontWeight,
          color,
          // Amounts stay in the text font (Inter) even with heading variants, with aligned digits.
          fontFamily: (t) => t.typography.fontFamily,
          fontVariantNumeric: 'tabular-nums',
        }}>
        {label ? `${label} ` : ''}
        {lines.primary}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}
      >
        {lines.secondary}
      </Typography>
    </Box>
  );
}
