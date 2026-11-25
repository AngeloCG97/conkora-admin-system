import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { formatDate } from '@/lib/dates';
import { DualAmount } from '@/components/money/DualAmount';
import { ORDER_FIELDS, type Order } from './OrderDialog';
import { paymentState } from './orders';
import { NO_TRIP_LABEL } from '@/lib/terms';

/** Total, Abono and Saldo of a Venta as computed by the `order_summary` view (never computed here). */
export interface OrderSummary {
  total: number;
  total_usd: number;
  paid: number;
  paid_usd: number;
  balance: number;
  balance_usd: number;
  is_paid: boolean;
  total_crc: number;
  paid_crc: number;
  balance_crc: number;
}

/** A Venta row with what the lists show (Cliente, Viaje, moneda and Total/Abono/Saldo from `order_summary`). */
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
  summary { total total_usd paid paid_usd balance balance_usd is_paid total_crc paid_crc balance_crc }`;

/** "Pagado" / "Saldo pendiente" chip derived from the Saldo (nothing for Cancelados or empty Ventas). */
export function PaymentChip({ status, summary }: { status: string; summary: OrderSummary | null }) {
  const state = paymentState(status, summary);
  if (!state) return null;
  return state === 'paid' ? (
    <Chip size="small" label="Pagado" color="success" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
  ) : (
    <Chip size="small" label="Saldo pendiente" color="warning" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
  );
}

/** Link card to the Venta's detail page. `showCustomer` is off on the Cliente's own page. */
export function OrderCard({
  order,
  statusLabel,
  showCustomer = true,
}: {
  order: OrderRow;
  statusLabel: string;
  showCustomer?: boolean;
}) {
  const s = order.summary;
  const state = paymentState(order.status, order.summary);
  return (
    <Card variant="outlined">
      <CardActionArea component={Link} href={`/ventas/detalle/?id=${order.id}`}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
            {showCustomer && <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{order.customer.name}</Typography>}
            <Typography variant="body2" color="text.secondary">
              {formatDate(order.date)} · {order.trip?.name ?? NO_TRIP_LABEL}
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
            <DualAmount amount={s?.total ?? 0} currency={order.currency} usd={s?.total_usd ?? 0} crc={s?.total_crc ?? 0} />
            {(s?.paid ?? 0) > 0 && (
              <DualAmount
                label="Abono"
                amount={s?.paid ?? 0}
                currency={order.currency}
                usd={s?.paid_usd ?? 0}
                crc={s?.paid_crc ?? 0}
                variant="body2"
                fontWeight={400}
                color="text.secondary"
              />
            )}
            {state === 'pending' && (
              <DualAmount
                label="Saldo"
                amount={s?.balance ?? 0}
                currency={order.currency}
                usd={s?.balance_usd ?? 0}
                crc={s?.balance_crc ?? 0}
                variant="body2"
                fontWeight={400}
                color="warning.main"
              />
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
