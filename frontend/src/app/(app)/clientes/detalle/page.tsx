'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { GraphQLRequestError, gqlRequest } from '@/lib/graphql';
import { ORDER_ROW_FIELDS, OrderCard, type OrderRow } from '../../pedidos/OrderCard';
import { ORDER_OPTIONS_QUERY, OrderDialog, type OrderOptions } from '../../pedidos/OrderDialog';
import { AccountFigures, type AccountSummary } from '../AccountFigures';
import { CUSTOMER_FIELDS, CustomerDialog, type Customer } from '../CustomerDialog';

const CUSTOMER_QUERY = `query Customer($id: uuid!) {
  customer_by_pk(id: $id) { ${CUSTOMER_FIELDS} }
}`;

const CUSTOMER_ORDERS_QUERY = `query CustomerOrders($id: uuid!) {
  order(where: { customer_id: { _eq: $id } }, order_by: [{ date: desc }, { created_at: desc }]) { ${ORDER_ROW_FIELDS} }
}`;

const CUSTOMER_ACCOUNT_QUERY = `query CustomerAccount($id: uuid!) {
  customer_by_pk(id: $id) {
    summary { order_count total_usd paid_usd balance_usd }
    trip_summaries(order_by: [{ trip: { start_date: desc_nulls_last } }]) {
      trip_id
      trip { name }
      order_count total_usd paid_usd balance_usd
    }
  }
}`;

interface CustomerAccount {
  customer_by_pk: {
    summary: AccountSummary | null;
    trip_summaries: (AccountSummary & { trip_id: string | null; trip: { name: string } | null })[];
  } | null;
}

const DELETE_CUSTOMER = `mutation DeleteCustomer($id: uuid!) { delete_customer_by_pk(id: $id) { id } }`;

function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => gqlRequest<{ customer_by_pk: Customer | null }>(CUSTOMER_QUERY, { id }),
  });

  const orders = useQuery({
    queryKey: ['orders', 'customer', id],
    queryFn: () => gqlRequest<{ order: OrderRow[] }>(CUSTOMER_ORDERS_QUERY, { id }),
  });
  // Under ['orders', ...] so Pedido/Abono changes refresh the account.
  const account = useQuery({
    queryKey: ['orders', 'customer-account', id],
    queryFn: () => gqlRequest<CustomerAccount>(CUSTOMER_ACCOUNT_QUERY, { id }),
  });
  const options = useQuery({
    queryKey: ['order-options'],
    queryFn: () => gqlRequest<OrderOptions>(ORDER_OPTIONS_QUERY),
  });
  const statusLabel = new Map(options.data?.order_status.map((s) => [s.value, s.comment]));

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_CUSTOMER, { id }),
    onSuccess: () => {
      notify.success('Cliente eliminado');
      qc.removeQueries({ queryKey: ['customer', id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.push('/clientes/');
    },
    onError: (e) =>
      notify.error(
        e instanceof GraphQLRequestError && e.code === 'constraint-violation'
          ? 'No se puede eliminar: el Cliente tiene Pedidos'
          : 'No se pudo eliminar',
      ),
  });

  const onDelete = async () => {
    if (await confirm({ title: '¿Eliminar el Cliente?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  if (isPending) return <Loading />;
  const customer = data?.customer_by_pk;
  if (!customer) {
    return (
      <>
        <PageHeader title="Cliente no encontrado" />
        <Button component={Link} href="/clientes/" startIcon={<ArrowBackIcon />}>
          Volver a Clientes
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={customer.name}
        actions={
          <Stack direction="row" spacing={1}>
            <IconButton aria-label="Editar Cliente" onClick={() => setEditing(true)}>
              <EditIcon />
            </IconButton>
            <IconButton aria-label="Eliminar Cliente" color="error" onClick={onDelete} disabled={remove.isPending}>
              <DeleteIcon />
            </IconButton>
          </Stack>
        }
      />
      <Button component={Link} href="/clientes/" startIcon={<ArrowBackIcon />} sx={{ mb: 2, mt: -2 }}>
        Clientes
      </Button>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary">Teléfono</Typography>
          <Typography sx={{ mb: 1.5 }}>{customer.phone ?? '—'}</Typography>
          <Typography variant="body2" color="text.secondary">Correo</Typography>
          <Typography sx={{ mb: 1.5, overflowWrap: 'anywhere' }}>{customer.email ?? '—'}</Typography>
          {customer.notes && (
            <>
              <Typography variant="body2" color="text.secondary">Notas</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{customer.notes}</Typography>
            </>
          )}
        </CardContent>
      </Card>

      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1.5 }}>
        Cuenta (USD)
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Total de {account.data?.customer_by_pk?.summary?.order_count ?? 0} Pedidos (sin Cancelados)
          </Typography>
          <AccountFigures summary={account.data?.customer_by_pk?.summary ?? null} />
        </CardContent>
      </Card>
      {(account.data?.customer_by_pk?.trip_summaries.length ?? 0) > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {account.data?.customer_by_pk?.trip_summaries.map((g) => (
            <Card key={g.trip_id ?? 'personal'} variant="outlined">
              <CardContent>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{g.trip?.name ?? 'Personal'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {g.order_count} {g.order_count === 1 ? 'Pedido' : 'Pedidos'}
                </Typography>
                <AccountFigures summary={g} />
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 3, mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          Pedidos
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreatingOrder(true)} disabled={!options.data}>
          Nuevo Pedido
        </Button>
      </Stack>
      {orders.isPending ? (
        <Loading />
      ) : orders.data?.order.length === 0 ? (
        <Typography color="text.secondary">Este Cliente todavía no tiene Pedidos.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {orders.data?.order.map((o) => (
            <OrderCard key={o.id} order={o} statusLabel={statusLabel.get(o.status) ?? o.status} showCustomer={false} />
          ))}
        </Stack>
      )}

      {creatingOrder && options.data && (
        <OrderDialog key="new-order" options={options.data} fixedCustomerId={id} onClose={() => setCreatingOrder(false)} />
      )}
      {editing && <CustomerDialog customer={customer} onClose={() => setEditing(false)} />}
    </>
  );
}

function CustomerDetailRoute() {
  const id = useSearchParams().get('id');
  if (!id) return <PageHeader title="Cliente no encontrado" />;
  return <CustomerDetail id={id} />;
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CustomerDetailRoute />
    </Suspense>
  );
}
