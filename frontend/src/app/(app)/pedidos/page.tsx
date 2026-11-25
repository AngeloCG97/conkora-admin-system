'use client';

import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDate } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { NO_TRIP_LABEL } from '@/lib/terms';
import type { TripFilter } from '../gastos/expenses';
import { ORDER_OPTIONS_QUERY, type OrderOptions } from '../ventas/OrderDialog';
import { REQUEST_FIELDS, RequestDialog, type CustomerRequest } from './RequestDialog';
import { itemCountLabel, requestWhere, type RequestFilters } from './requests';

type RequestRow = CustomerRequest & {
  customer: { name: string };
  trip: { name: string } | null;
  items_aggregate: { aggregate: { count: number } | null };
};

const REQUESTS_QUERY = `query Requests($where: customer_request_bool_exp!) {
  customer_request(where: $where, order_by: [{ date: desc }, { created_at: desc }]) {
    ${REQUEST_FIELDS}
    customer { name }
    trip { name }
    items_aggregate { aggregate { count } }
  }
}`;

/** Select value <-> TripFilter (same as the Ventas list). */
const ALL = '__all';
const GENERAL = '__general';
const tripFilterValue = (f: TripFilter) => (f.kind === 'all' ? ALL : f.kind === 'general' ? GENERAL : f.id);
const toTripFilter = (value: string): TripFilter =>
  value === ALL ? { kind: 'all' } : value === GENERAL ? { kind: 'general' } : { kind: 'trip', id: value };

export default function RequestsPage() {
  const [filters, setFilters] = useState<RequestFilters>({ trip: { kind: 'all' }, customerId: null });
  const [creating, setCreating] = useState(false);

  const options = useQuery({
    queryKey: ['order-options'],
    queryFn: () => gqlRequest<OrderOptions>(ORDER_OPTIONS_QUERY),
  });

  const where = requestWhere(filters);
  const requests = useQuery({
    queryKey: ['requests', where],
    queryFn: () => gqlRequest<{ customer_request: RequestRow[] }>(REQUESTS_QUERY, { where }),
    placeholderData: (prev) => prev,
  });

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
      <Typography color="text.secondary" sx={{ mb: 2, mt: -1 }}>
        Lo que los Clientes nos piden buscar. Al encontrar un Artículo, muévelo a una Venta.
      </Typography>

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
          <MenuItem value={GENERAL}>{NO_TRIP_LABEL} (sin Viaje)</MenuItem>
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
      </Stack>

      {requests.isPending ? (
        <Loading />
      ) : requests.data?.customer_request.length === 0 ? (
        <Typography color="text.secondary">No hay Pedidos con estos filtros.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {requests.data?.customer_request.map((r) => {
            const count = r.items_aggregate.aggregate?.count ?? 0;
            return (
              <Card key={r.id} variant="outlined">
                <CardActionArea component={Link} href={`/pedidos/detalle/?id=${r.id}`}>
                  <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.customer.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(r.date)} · {r.trip?.name ?? NO_TRIP_LABEL}
                      </Typography>
                      {r.notes && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {r.notes}
                        </Typography>
                      )}
                    </Stack>
                    <Chip
                      size="small"
                      label={itemCountLabel(count)}
                      color={count > 0 ? 'secondary' : 'default'}
                      variant={count > 0 ? 'filled' : 'outlined'}
                      sx={{ flexShrink: 0 }}
                    />
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Stack>
      )}

      {creating && options.data && (
        <RequestDialog
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
