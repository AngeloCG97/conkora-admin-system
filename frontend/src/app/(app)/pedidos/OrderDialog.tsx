'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useNotify } from '@/components/feedback/FeedbackProvider';
import { todayIso } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';

export interface Order {
  id: string;
  customer_id: string;
  trip_id: string | null;
  currency_code: string;
  status: string;
  date: string;
  notes: string | null;
}

export const ORDER_FIELDS = 'id customer_id trip_id currency_code status date notes';

/** Choices for the form selects and filters (loaded once per page). */
export interface OrderOptions {
  customer: { id: string; name: string }[];
  trip: { id: string; name: string }[];
  currency: { code: string; name: string; symbol: string }[];
  order_status: { value: string; comment: string }[];
}

export const ORDER_OPTIONS_QUERY = `query OrderOptions {
  customer(order_by: [{ name: asc }]) { id name }
  trip(order_by: [{ start_date: desc }]) { id name }
  currency(order_by: [{ code: asc }]) { code name symbol }
  order_status { value comment }
}`;

const INSERT_ORDER = `mutation InsertOrder($object: order_insert_input!) {
  insert_order_one(object: $object) { id }
}`;

const UPDATE_ORDER = `mutation UpdateOrder($id: uuid!, $set: order_set_input!) {
  update_order_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const NO_TRIP = '';

/**
 * Create (no `order`) or edit (with `order`) a Pedido. A new Pedido opens its detail page to add Artículos.
 * Mount with a `key` to reset state.
 */
export function OrderDialog({
  order,
  options,
  fixedCustomerId,
  defaultCustomerId,
  defaultTripId,
  onClose,
}: {
  order?: Order;
  options: OrderOptions;
  /** Cliente of a new Pedido started from that Cliente's page (the select is locked). */
  fixedCustomerId?: string;
  /** Cliente preselected (but changeable) for a new Pedido, e.g. the one being filtered. */
  defaultCustomerId?: string;
  /** Viaje preselected for a new Pedido (e.g. the one being filtered). */
  defaultTripId?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const router = useRouter();

  const [customerId, setCustomerId] = useState(order?.customer_id ?? fixedCustomerId ?? defaultCustomerId ?? '');
  const [tripId, setTripId] = useState(order ? (order.trip_id ?? NO_TRIP) : (defaultTripId ?? NO_TRIP));
  const [currencyCode, setCurrencyCode] = useState(order?.currency_code ?? 'USD');
  const [status, setStatus] = useState(order?.status ?? 'pending');
  const [date, setDate] = useState(order?.date ?? todayIso());
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [touched, setTouched] = useState(false);

  const valid = customerId !== '' && date !== '';

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        customer_id: customerId,
        trip_id: tripId === NO_TRIP ? null : tripId,
        currency_code: currencyCode,
        status,
        date,
        notes: notes.trim() || null,
      };
      if (order) {
        await gqlRequest(UPDATE_ORDER, { id: order.id, set: fields });
        return order.id;
      }
      const res = await gqlRequest<{ insert_order_one: { id: string } }>(INSERT_ORDER, { object: fields });
      return res.insert_order_one.id;
    },
    onSuccess: (id) => {
      notify.success(order ? 'Pedido actualizado' : 'Pedido creado');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
      onClose();
      if (!order) router.push(`/pedidos/detalle/?id=${id}`);
    },
    onError: () => notify.error('No se pudo guardar el Pedido'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{order ? 'Editar Pedido' : 'Nuevo Pedido'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Cliente"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={fixedCustomerId !== undefined}
            error={touched && customerId === ''}
            helperText={touched && customerId === '' ? 'Requerido' : undefined}
          >
            {options.customer.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Viaje"
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            helperText="Sin Viaje = Personal (usa el tipo de cambio global)"
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value={NO_TRIP}>Sin Viaje (Personal)</MenuItem>
            {options.trip.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Moneda"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              sx={{ minWidth: 110 }}
            >
              {options.currency.map((c) => (
                <MenuItem key={c.code} value={c.code}>
                  {c.code}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              sx={{ flexGrow: 1 }}
            >
              {options.order_status.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.comment}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Fecha"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={touched && date === ''}
            helperText={touched && date === '' ? 'Requerida' : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
