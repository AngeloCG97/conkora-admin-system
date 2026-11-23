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
import { formatMoney } from '@/lib/money';
import { ORDER_OPTIONS_QUERY, OrderDialog, type OrderOptions } from '../OrderDialog';
import { ORDER_ROW_FIELDS, PaymentChip, type OrderRow } from '../OrderCard';
import { ORDER_ITEM_FIELDS, OrderItemDialog, type OrderItem } from '../OrderItemDialog';
import { PAYMENT_FIELDS, PaymentDialog, type Payment } from '../PaymentDialog';

type OrderDetail = OrderRow & { items: OrderItem[]; payments: Payment[] };

const USD = { code: 'USD', symbol: '$' };

const ORDER_QUERY = `query Order($id: uuid!) {
  order_by_pk(id: $id) {
    ${ORDER_ROW_FIELDS}
    items(order_by: [{ created_at: asc }]) { ${ORDER_ITEM_FIELDS} }
    payments(order_by: [{ date: desc }, { created_at: desc }]) { ${PAYMENT_FIELDS} }
  }
}`;

const UPDATE_STATUS = `mutation UpdateOrderStatus($id: uuid!, $status: order_status_enum!) {
  update_order_by_pk(pk_columns: { id: $id }, _set: { status: $status }) { id }
}`;

const DELETE_ORDER = `mutation DeleteOrder($id: uuid!) { delete_order_by_pk(id: $id) { id } }`;

/** One line of the Total / Abono / Saldo block: amount in the Pedido's currency, plus USD when it differs. */
function AmountLine({
  label,
  amount,
  amountUsd,
  currency,
  strong = false,
}: {
  label: string;
  amount: number;
  amountUsd: number;
  currency: { code: string; symbol: string };
  strong?: boolean;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography color="text.secondary">{label}</Typography>
      <Stack sx={{ textAlign: 'right' }}>
        <Typography variant={strong ? 'h6' : 'body1'} sx={{ fontWeight: strong ? 700 : 500 }}>
          {formatMoney(amount, currency)}
        </Typography>
        {currency.code !== USD.code && (
          <Typography variant="body2" color="text.secondary">
            ≈ {formatMoney(amountUsd, USD)} USD
          </Typography>
        )}
      </Stack>
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
      notify.success('Pedido eliminado');
      qc.removeQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.push('/pedidos/');
    },
    onError: () => notify.error('No se pudo eliminar'),
  });

  const onDelete = async () => {
    if (
      await confirm({
        title: '¿Eliminar el Pedido?',
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
        <PageHeader title="Pedido no encontrado" />
        <Button component={Link} href="/pedidos/" startIcon={<ArrowBackIcon />}>
          Volver a Pedidos
        </Button>
      </>
    );
  }

  const s = order.summary;

  return (
    <>
      <PageHeader
        title={`Pedido de ${order.customer.name}`}
        actions={
          <Stack direction="row" spacing={1}>
            <IconButton aria-label="Editar Pedido" onClick={() => setEditing(true)} disabled={!options.data}>
              <EditIcon />
            </IconButton>
            <IconButton aria-label="Eliminar Pedido" color="error" onClick={onDelete} disabled={remove.isPending}>
              <DeleteIcon />
            </IconButton>
          </Stack>
        }
      />
      <Button component={Link} href="/pedidos/" startIcon={<ArrowBackIcon />} sx={{ mb: 2, mt: -2 }}>
        Pedidos
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
              'Personal'
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
            <AmountLine label="Total" amount={s?.total ?? 0} amountUsd={s?.total_usd ?? 0} currency={order.currency} />
            <AmountLine label="Abono" amount={s?.paid ?? 0} amountUsd={s?.paid_usd ?? 0} currency={order.currency} />
            <AmountLine
              label="Saldo"
              amount={s?.balance ?? 0}
              amountUsd={s?.balance_usd ?? 0}
              currency={order.currency}
              strong
            />
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <PaymentChip status={order.status} summary={s} />
            </Stack>
          </Stack>
          {order.status === 'cancelled' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Pedido cancelado: no cuenta en los Totales de reportes.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          Artículos
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setItemEditing('new')}>
          Agregar Artículo
        </Button>
      </Stack>
      {order.items.length === 0 ? (
        <Typography color="text.secondary">Este Pedido todavía no tiene Artículos.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {order.items.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardActionArea onClick={() => setItemEditing(item)}>
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.quantity} × {formatMoney(item.price, order.currency)}
                      {item.size ? ` · Talla ${item.size}` : ''}
                    </Typography>
                  </Stack>
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
        <Typography color="text.secondary">Este Pedido todavía no tiene Abonos.</Typography>
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
                  <Typography sx={{ fontWeight: 600, flexShrink: 0 }}>{formatMoney(payment.amount, payment.currency)}</Typography>
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
  if (!id) return <PageHeader title="Pedido no encontrado" />;
  return <OrderDetailView id={id} />;
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrderDetailRoute />
    </Suspense>
  );
}
