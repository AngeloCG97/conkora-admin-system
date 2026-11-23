'use client';

import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { gqlRequest } from '@/lib/graphql';
import type { TripFilter } from '../gastos/expenses';
import { ORDER_OPTIONS_QUERY, OrderDialog, type OrderOptions } from './OrderDialog';
import { ORDER_ROW_FIELDS, OrderCard, type OrderRow } from './OrderCard';
import { orderWhere, type OrderFilters } from './orders';

const ORDERS_QUERY = `query Orders($where: order_bool_exp!) {
  order(where: $where, order_by: [{ date: desc }, { created_at: desc }]) { ${ORDER_ROW_FIELDS} }
}`;

/** Select value <-> TripFilter. */
const ALL = '__all';
const PERSONAL = '__personal';
const tripFilterValue = (f: TripFilter) => (f.kind === 'all' ? ALL : f.kind === 'personal' ? PERSONAL : f.id);
const toTripFilter = (value: string): TripFilter =>
  value === ALL ? { kind: 'all' } : value === PERSONAL ? { kind: 'personal' } : { kind: 'trip', id: value };

export default function OrdersPage() {
  const [filters, setFilters] = useState<OrderFilters>({ trip: { kind: 'all' }, customerId: null, status: null });
  const [creating, setCreating] = useState(false);

  const options = useQuery({
    queryKey: ['order-options'],
    queryFn: () => gqlRequest<OrderOptions>(ORDER_OPTIONS_QUERY),
  });

  const where = orderWhere(filters);
  const orders = useQuery({
    queryKey: ['orders', where],
    queryFn: () => gqlRequest<{ order: OrderRow[] }>(ORDERS_QUERY, { where }),
    placeholderData: (prev) => prev,
  });

  const statusLabel = new Map(options.data?.order_status.map((s) => [s.value, s.comment]));

  return (
    <>
      <PageHeader
        title="Pedidos"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} disabled={!options.data}>
            Nuevo Pedido
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Viaje"
          value={tripFilterValue(filters.trip)}
          onChange={(e) => setFilters((f) => ({ ...f, trip: toTripFilter(e.target.value) }))}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          <MenuItem value={PERSONAL}>Sin Viaje (Personal)</MenuItem>
          {options.data?.trip.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Cliente"
          value={filters.customerId ?? ALL}
          onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value === ALL ? null : e.target.value }))}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          {options.data?.customer.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Estado"
          value={filters.status ?? ALL}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value === ALL ? null : e.target.value }))}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          {options.data?.order_status.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.comment}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {orders.isPending ? (
        <Loading />
      ) : orders.data?.order.length === 0 ? (
        <Typography color="text.secondary">No hay Pedidos con estos filtros.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {orders.data?.order.map((o) => (
            <OrderCard key={o.id} order={o} statusLabel={statusLabel.get(o.status) ?? o.status} />
          ))}
        </Stack>
      )}

      {creating && options.data && (
        <OrderDialog
          key="new"
          options={options.data}
          defaultCustomerId={filters.customerId ?? undefined}
          defaultTripId={filters.trip.kind === 'trip' ? filters.trip.id : undefined}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
