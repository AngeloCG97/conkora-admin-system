import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { ORDER_FIELDS, type Order } from './OrderDialog';
import { paymentState } from './orders';

/** Total, Abono and Saldo of a Pedido as computed by the `order_summary` view (never computed here). */
export interface OrderSummary {
  total: number;
  total_usd: number;
  paid: number;
  paid_usd: number;
  balance: number;
  balance_usd: number;
  is_paid: boolean;
}

/** A Pedido row with what the lists show (Cliente, Viaje, moneda and Total/Abono/Saldo from `order_summary`). */
export type OrderRow = Order & {
  customer: { name: string };
  trip: { name: string } | null;
  currency: { code: string; symbol: string };
  summary: OrderSummary | null;
};

export const ORDER_ROW_FIELDS = `${ORDER_FIELDS}
  customer { name }
  trip { name }
  currency { code symbol }
  summary { total total_usd paid paid_usd balance balance_usd is_paid }`;

const USD = { code: 'USD', symbol: '$' };

/** "Pagado" / "Saldo pendiente" chip derived from the Saldo (nothing for Cancelados or empty Pedidos). */
export function PaymentChip({ status, summary }: { status: string; summary: OrderSummary | null }) {
  const state = paymentState(status, summary);
  if (!state) return null;
  return state === 'paid' ? (
    <Chip size="small" label="Pagado" color="success" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
  ) : (
    <Chip size="small" label="Saldo pendiente" color="warning" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
  );
}

/** Link card to the Pedido's detail page. `showCustomer` is off on the Cliente's own page. */
export function OrderCard({
  order,
  statusLabel,
  showCustomer = true,
}: {
  order: OrderRow;
  statusLabel: string;
  showCustomer?: boolean;
}) {
  const total = order.summary?.total ?? 0;
  const totalUsd = order.summary?.total_usd ?? 0;
  const balance = order.summary?.balance ?? 0;
  const state = paymentState(order.status, order.summary);
  return (
    <Card variant="outlined">
      <CardActionArea component={Link} href={`/pedidos/detalle/?id=${order.id}`}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
            {showCustomer && <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{order.customer.name}</Typography>}
            <Typography variant="body2" color="text.secondary">
              {formatDate(order.date)} · {order.trip?.name ?? 'Personal'}
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={statusLabel}
                color={order.status === 'delivered' ? 'secondary' : 'default'}
                variant={order.status === 'cancelled' ? 'outlined' : 'filled'}
              />
              <PaymentChip status={order.status} summary={order.summary} />
            </Stack>
          </Stack>
          <Stack spacing={0.5} sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{formatMoney(total, order.currency)}</Typography>
            {order.currency_code !== USD.code && (
              <Typography variant="body2" color="text.secondary">
                ≈ {formatMoney(totalUsd, USD)} USD
              </Typography>
            )}
            {state === 'pending' && (
              <Typography variant="body2" color="warning.main">
                Saldo {formatMoney(balance, order.currency)}
              </Typography>
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
