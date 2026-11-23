import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { formatMoney } from '@/lib/money';

/** Pedidos count, Total, Abono and Saldo in USD as computed by the `customer_summary` / `customer_trip_summary` views. */
export interface AccountSummary {
  order_count: number;
  total_usd: number;
  paid_usd: number;
  balance_usd: number;
}

const USD = { code: 'USD', symbol: '$' };

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, color }}>
        {value}
      </Typography>
    </div>
  );
}

/** Total / Abono / Saldo row (USD). Display only: the figures come from SQL views, never computed here. */
export function AccountFigures({ summary, sx }: { summary: AccountSummary | null; sx?: SxProps<Theme> }) {
  const s = summary ?? { order_count: 0, total_usd: 0, paid_usd: 0, balance_usd: 0 };
  return (
    <Stack direction="row" useFlexGap sx={{ gap: 2.5, flexWrap: 'wrap', ...sx }}>
      <Figure label="Total" value={formatMoney(s.total_usd, USD)} />
      <Figure label="Abono" value={formatMoney(s.paid_usd, USD)} />
      <Figure label="Saldo" value={formatMoney(s.balance_usd, USD)} color={s.balance_usd > 0 ? 'warning.main' : undefined} />
    </Stack>
  );
}
