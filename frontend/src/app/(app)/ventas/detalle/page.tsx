'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDate } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { DualAmount } from '@/components/money/DualAmount';
import { formatMoney } from '@/lib/money';
import { ORDER_OPTIONS_QUERY, OrderDialog, type OrderOptions } from '../OrderDialog';
import { ORDER_ROW_FIELDS, PaymentChip, type OrderRow } from '../OrderCard';
import { ItemPhoto } from '../ItemPhoto';
import { ORDER_ITEM_FIELDS, OrderItemDialog, type OrderItem } from '../OrderItemDialog';
import { PAYMENT_FIELDS, PaymentDialog, type Payment } from '../PaymentDialog';
import { ShareOrder } from '../ShareOrder';
import { NO_TRIP_LABEL } from '@/lib/terms';

/** ₡ and $ (and, for Artículos, Venta-currency) amounts from `order_item_summary` / `payment_summary`. */
type ItemRow = OrderItem & { summary: { line_total: number; line_total_usd: number; line_total_crc: number } | null };
type PaymentRow = Payment & { summary: { amount_usd: number; amount_crc: number } | null };
type OrderDetail = OrderRow & { items: ItemRow[]; payments: PaymentRow[] };

const ORDER_QUERY = `query Order($id: uuid!) {
  order_by_pk(id: $id) {
    ${ORDER_ROW_FIELDS}
    items(order_by: [{ created_at: asc }]) { ${ORDER_ITEM_FIELDS} summary { line_total line_total_usd line_total_crc } }
    payments(order_by: [{ date: desc }, { created_at: desc }]) { ${PAYMENT_FIELDS} summary { amount_usd amount_crc } }
  }
}`;

const UPDATE_STATUS = `mutation UpdateOrderStatus($id: uuid!, $status: order_status_enum!) {
  update_order_by_pk(pk_columns: { id: $id }, _set: { status: $status }) { id }
}`;

const DELETE_ORDER = `mutation DeleteOrder($id: uuid!) { delete_order_by_pk(id: $id) { id } }`;

/** One line of the Total / Abono / Saldo block: amount in the Venta's currency, then its ₡ / $ equivalents. */
function AmountLine({
  label,
  amount,
  usd,
  crc,
  currency,
  strong = false,
}: {
  label: string;
  amount: number;
  usd: number;
  crc: number;
  currency: { code: string; symbol: string };
  strong?: boolean;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography color="text.secondary">{label}</Typography>
      <DualAmount
        amount={amount}
        currency={currency}
        usd={usd}
        crc={crc}
        variant={strong ? 'h6' : 'body1'}
        fontWeight={strong ? 700 : 500}
        align="right"
      />
    </Stack>
  );
}

function OrderDetailView({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [itemEditing, setItemEditing] = useState<OrderItem | 'new' | null>(null);
  const [paymentEditing, setPaymentEditing] = useState<Payment | 'new' | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['order', id],
    queryFn: () => gqlRequest<{ order_by_pk: OrderDetail | null }>(ORDER_QUERY, { id }),
  });
  const options = useQuery({
    queryKey: ['order-options'],
    queryFn: () => gqlRequest<OrderOptions>(ORDER_OPTIONS_QUERY),
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) => gqlRequest(UPDATE_STATUS, { id, status }),
    onSuccess: () => {
      notify.success('Estado actualizado');
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => notify.error('No se pudo cambiar el estado'),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_ORDER, { id }),
    onSuccess: () => {
      notify.success('Venta eliminada');
      qc.removeQueries({ queryKey: ['order', id] });
      qc.removeQueries({ queryKey: ['order-share', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.push('/ventas/');
    },
    onError: () => notify.error('No se pudo eliminar'),
  });

  const onDelete = async () => {
    if (
      await confirm({
        title: '¿Eliminar la Venta?',
        message: 'También se eliminarán sus Artículos y Abonos. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar',
        danger: true,
      })
    ) {
      remove.mutate();
    }
  };

  if (isPending) return <Loading />;
  const order = data?.order_by_pk;
  if (!order) {
    return (
      <>
        <PageHeader title="Venta no encontrada" />
        <Button component={Link} href="/ventas/" startIcon={<ArrowBackIcon />}>
          Volver a Ventas
        </Button>
      </>
    );
  }

  const s = order.summary;

  return (
    <>
      <PageHeader
        title={`Venta de ${order.customer.name}`}
        actions={
          <Stack direction="row" spacing={1}>
            <IconButton aria-label="Editar Venta" onClick={() => setEditing(true)} disabled={!options.data}>
              <EditIcon />
            </IconButton>
            <IconButton aria-label="Eliminar Venta" color="error" onClick={onDelete} disabled={remove.isPending}>
              <DeleteIcon />
            </IconButton>
          </Stack>
        }
      />
      <Button component={Link} href="/ventas/" startIcon={<ArrowBackIcon />} sx={{ mb: 2, mt: -2 }}>
        Ventas
      </Button>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">Cliente</Typography>
          <Typography sx={{ mb: 1.5 }}>
            <Link href={`/clientes/detalle/?id=${order.customer_id}`}>{order.customer.name}</Link>
          </Typography>
          <Typography variant="body2" color="text.secondary">Viaje</Typography>
          <Typography sx={{ mb: 1.5 }}>
            {order.trip ? (
              <Link href={`/viajes/detalle/?id=${order.trip_id}`}>{order.trip.name}</Link>
            ) : (
              NO_TRIP_LABEL
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">Fecha · Moneda</Typography>
          <Typography sx={{ mb: 1.5 }}>
            {formatDate(order.date)} · {order.currency_code}
          </Typography>
          {order.notes && (
            <>
              <Typography variant="body2" color="text.secondary">Notas</Typography>
              <Typography sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>{order.notes}</Typography>
            </>
          )}
          <TextField
            select
            size="small"
            label="Estado"
            value={order.status}
            onChange={(e) => changeStatus.mutate(e.target.value)}
            disabled={changeStatus.isPending || !options.data}
            sx={{ minWidth: 180, mb: 2 }}
          >
            {(options.data?.order_status ?? [{ value: order.status, comment: order.status }]).map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.comment}
              </MenuItem>
            ))}
          </TextField>
          <Divider sx={{ mb: 1.5 }} />
          <Stack spacing={1}>
            <AmountLine label="Total" amount={s?.total ?? 0} usd={s?.total_usd ?? 0} crc={s?.total_crc ?? 0} currency={order.currency} />
            <AmountLine label="Abono" amount={s?.paid ?? 0} usd={s?.paid_usd ?? 0} crc={s?.paid_crc ?? 0} currency={order.currency} />
            <AmountLine
              label="Saldo"
              amount={s?.balance ?? 0}
              usd={s?.balance_usd ?? 0}
              crc={s?.balance_crc ?? 0}
              currency={order.currency}
              strong
            />
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <PaymentChip status={order.status} summary={s} />
            </Stack>
          </Stack>
          {order.status === 'cancelled' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Venta cancelada: no cuenta en los Totales de reportes.
            </Typography>
          )}
        </CardContent>
      </Card>

      <ShareOrder orderId={id} customerName={order.customer.name} cancelled={order.status === 'cancelled'} />

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          Artículos
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setItemEditing('new')}>
          Agregar Artículo
        </Button>
      </Stack>
      {order.items.length === 0 ? (
        <Typography color="text.secondary">Esta Venta todavía no tiene Artículos.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {order.items.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardActionArea onClick={() => setItemEditing(item)}>
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <ItemPhoto url={item.photo_url} alt={item.name} />
                  <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.quantity} × {formatMoney(item.price, order.currency)}
                      {item.size ? ` · Talla ${item.size}` : ''}
                    </Typography>
                    {item.description && (
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        {item.description}
                      </Typography>
                    )}
                  </Stack>
                  <DualAmount
                    amount={item.summary?.line_total ?? 0}
                    currency={order.currency}
                    usd={item.summary?.line_total_usd ?? 0}
                    crc={item.summary?.line_total_crc ?? 0}
                    align="right"
                    sx={{ flexShrink: 0 }}
                  />
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 4, mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          Abonos
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setPaymentEditing('new')}>
          Registrar Abono
        </Button>
      </Stack>
      {order.payments.length === 0 ? (
        <Typography color="text.secondary">Esta Venta todavía no tiene Abonos.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {order.payments.map((payment) => (
            <Card key={payment.id} variant="outlined">
              <CardActionArea onClick={() => setPaymentEditing(payment)}>
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(payment.date)}
                    </Typography>
                    {payment.notes && (
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        {payment.notes}
                      </Typography>
                    )}
                  </Stack>
                  <DualAmount
                    amount={payment.amount}
                    currency={payment.currency}
                    usd={payment.summary?.amount_usd ?? 0}
                    crc={payment.summary?.amount_crc ?? 0}
                    align="right"
                    sx={{ flexShrink: 0 }}
                  />
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}

      {editing && options.data && <OrderDialog order={order} options={options.data} onClose={() => setEditing(false)} />}
      {itemEditing && (
        <OrderItemDialog
          key={itemEditing === 'new' ? 'new' : itemEditing.id}
          orderId={id}
          currencyCode={order.currency_code}
          item={itemEditing === 'new' ? undefined : itemEditing}
          onClose={() => setItemEditing(null)}
        />
      )}
      {paymentEditing && (
        <PaymentDialog
          key={paymentEditing === 'new' ? 'new' : paymentEditing.id}
          orderId={id}
          orderCurrencyCode={order.currency_code}
          currencies={options.data?.currency ?? []}
          payment={paymentEditing === 'new' ? undefined : paymentEditing}
          onClose={() => setPaymentEditing(null)}
        />
      )}
    </>
  );
}

function OrderDetailRoute() {
  const id = useSearchParams().get('id');
  if (!id) return <PageHeader title="Venta no encontrada" />;
  return <OrderDetailView id={id} />;
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrderDetailRoute />
    </Suspense>
  );
}
