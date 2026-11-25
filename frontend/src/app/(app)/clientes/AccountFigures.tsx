import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { DualAmount } from '@/components/money/DualAmount';

/** Pedidos count, Total, Abono and Saldo in USD and CRC as computed by the `customer_summary` / `customer_trip_summary` views. */
export interface AccountSummary {
  order_count: number;
  total_usd: number;
  paid_usd: number;
  balance_usd: number;
  total_crc: number;
  paid_crc: number;
  balance_crc: number;
}

/** GraphQL selection of every AccountSummary field. */
export const ACCOUNT_SUMMARY_FIELDS = 'order_count total_usd paid_usd balance_usd total_crc paid_crc balance_crc';

const EMPTY: AccountSummary = { order_count: 0, total_usd: 0, paid_usd: 0, balance_usd: 0, total_crc: 0, paid_crc: 0, balance_crc: 0 };

function Figure({ label, usd, crc, color }: { label: string; usd: number; crc: number; color?: string }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <DualAmount usd={usd} crc={crc} variant="body2" color={color} />
    </div>
  );
}

/** Total / Abono / Saldo row ($ and ₡). Display only: the figures come from SQL views, never computed here. */
export function AccountFigures({ summary, sx }: { summary: AccountSummary | null; sx?: SxProps<Theme> }) {
  const s = summary ?? EMPTY;
  return (
    <Stack direction="row" useFlexGap sx={{ gap: 2.5, flexWrap: 'wrap', ...sx }}>
      <Figure label="Total" usd={s.total_usd} crc={s.total_crc} />
      <Figure label="Abono" usd={s.paid_usd} crc={s.paid_crc} />
      <Figure label="Saldo" usd={s.balance_usd} crc={s.balance_crc} color={s.balance_usd > 0 ? 'warning.main' : undefined} />
    </Stack>
  );
}
