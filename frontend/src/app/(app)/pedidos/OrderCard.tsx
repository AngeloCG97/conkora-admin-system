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

/** A Pedido row with what the lists show (Cliente, Viaje, moneda and the Total from `order_summary`). */
export type OrderRow = Order & {
  customer: { name: string };
  trip: { name: string } | null;
  currency: { code: string; symbol: string };
  summary: { total: number; total_usd: number } | null;
};

export const ORDER_ROW_FIELDS = `${ORDER_FIELDS}
  customer { name }
  trip { name }
  currency { code symbol }
  summary { total total_usd }`;

const USD = { code: 'USD', symbol: '$' };

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
  return (
    <Card variant="outlined">
      <CardActionArea component={Link} href={`/pedidos/detalle/?id=${order.id}`}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
            {showCustomer && <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{order.customer.name}</Typography>}
            <Typography variant="body2" color="text.secondary">
              {formatDate(order.date)} · {order.trip?.name ?? 'Personal'}
            </Typography>
            <Chip
              size="small"
              label={statusLabel}
              color={order.status === 'delivered' ? 'secondary' : 'default'}
              variant={order.status === 'cancelled' ? 'outlined' : 'filled'}
              sx={{ alignSelf: 'flex-start' }}
            />
          </Stack>
          <Stack spacing={0.5} sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{formatMoney(total, order.currency)}</Typography>
            {order.currency_code !== USD.code && (
              <Typography variant="body2" color="text.secondary">
                ≈ {formatMoney(totalUsd, USD)} USD
              </Typography>
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
