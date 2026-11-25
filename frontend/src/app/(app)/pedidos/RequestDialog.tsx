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
import { NO_TRIP_LABEL } from '@/lib/terms';
import type { OrderOptions } from '../ventas/OrderDialog';

/** A Pedido: what a Cliente asked us to find, for a Viaje or General. */
export interface CustomerRequest {
  id: string;
  customer_id: string;
  trip_id: string | null;
  date: string;
  notes: string | null;
}

export const REQUEST_FIELDS = 'id customer_id trip_id date notes';

const INSERT_REQUEST = `mutation InsertRequest($object: customer_request_insert_input!) {
  insert_customer_request_one(object: $object) { id }
}`;

const UPDATE_REQUEST = `mutation UpdateRequest($id: uuid!, $set: customer_request_set_input!) {
  update_customer_request_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const NO_TRIP = '';

/**
 * Create (no `request`) or edit (with `request`) a Pedido. A new Pedido opens its detail page to add Artículos.
 * Uses the Ventas select options (`['order-options']`). Mount with a `key` to reset state.
 */
export function RequestDialog({
  request,
  options,
  defaultCustomerId,
  defaultTripId,
  onClose,
}: {
  request?: CustomerRequest;
  options: OrderOptions;
  /** Cliente preselected for a new Pedido (e.g. the one being filtered). */
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

  const [customerId, setCustomerId] = useState(request?.customer_id ?? defaultCustomerId ?? '');
  const [tripId, setTripId] = useState(request ? (request.trip_id ?? NO_TRIP) : (defaultTripId ?? NO_TRIP));
  const [date, setDate] = useState(request?.date ?? todayIso());
  const [notes, setNotes] = useState(request?.notes ?? '');
  const [touched, setTouched] = useState(false);

  const valid = customerId !== '' && date !== '';

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        customer_id: customerId,
        trip_id: tripId === NO_TRIP ? null : tripId,
        date,
        notes: notes.trim() || null,
      };
      if (request) {
        await gqlRequest(UPDATE_REQUEST, { id: request.id, set: fields });
        return request.id;
      }
      const res = await gqlRequest<{ insert_customer_request_one: { id: string } }>(INSERT_REQUEST, { object: fields });
      return res.insert_customer_request_one.id;
    },
    onSuccess: (id) => {
      notify.success(request ? 'Pedido actualizado' : 'Pedido creado');
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['request'] });
      onClose();
      if (!request) router.push(`/pedidos/detalle/?id=${id}`);
    },
    onError: () => notify.error('No se pudo guardar el Pedido'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{request ? 'Editar Pedido' : 'Nuevo Pedido'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Cliente"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
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
            helperText="Al moverlos, sus Artículos van a una Venta del mismo Viaje"
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value={NO_TRIP}>{NO_TRIP_LABEL} (sin Viaje)</MenuItem>
            {options.trip.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
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
