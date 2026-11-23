'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { todayIso } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { parsePaymentAmount } from './orders';
import { NO_TRIP_LABEL } from '@/lib/terms';

export interface Payment {
  id: string;
  amount: number;
  currency_code: string;
  date: string;
  notes: string | null;
  currency: { code: string; symbol: string };
}

export const PAYMENT_FIELDS = 'id amount currency_code date notes currency { code symbol }';

const INSERT_PAYMENT = `mutation InsertPayment($object: payment_insert_input!) {
  insert_payment_one(object: $object) { id }
}`;

const UPDATE_PAYMENT = `mutation UpdatePayment($id: uuid!, $set: payment_set_input!) {
  update_payment_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const DELETE_PAYMENT = `mutation DeletePayment($id: uuid!) { delete_payment_by_pk(id: $id) { id } }`;

/**
 * Create (no `payment`) or edit/delete (with `payment`) an Abono of a Pedido. The Abono keeps its own currency
 * (default: the Pedido's); `order_summary` converts it. Mount with a `key` to reset state.
 */
export function PaymentDialog({
  orderId,
  orderCurrencyCode,
  currencies,
  payment,
  onClose,
}: {
  orderId: string;
  orderCurrencyCode: string;
  currencies: { code: string }[];
  payment?: Payment;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const [amount, setAmount] = useState(payment ? String(payment.amount) : '');
  const [currencyCode, setCurrencyCode] = useState(payment?.currency_code ?? orderCurrencyCode);
  const [date, setDate] = useState(payment?.date ?? todayIso());
  const [notes, setNotes] = useState(payment?.notes ?? '');
  const [touched, setTouched] = useState(false);

  const amountValue = parsePaymentAmount(amount);
  const valid = amountValue !== null && date !== '';

  const done = (message: string) => {
    notify.success(message);
    qc.invalidateQueries({ queryKey: ['order', orderId] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const fields = { amount: amountValue, currency_code: currencyCode, date, notes: notes.trim() || null };
      return payment
        ? gqlRequest(UPDATE_PAYMENT, { id: payment.id, set: fields })
        : gqlRequest(INSERT_PAYMENT, { object: { ...fields, order_id: orderId } });
    },
    onSuccess: () => done(payment ? 'Abono actualizado' : 'Abono registrado'),
    onError: () => notify.error('No se pudo guardar el Abono'),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_PAYMENT, { id: payment!.id }),
    onSuccess: () => done('Abono eliminado'),
    onError: () => notify.error('No se pudo eliminar el Abono'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  const onDelete = async () => {
    if (await confirm({ title: '¿Eliminar el Abono?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  // Keep the current code selectable even if the options have not loaded yet.
  const codes = currencies.some((c) => c.code === currencyCode) ? currencies : [{ code: currencyCode }, ...currencies];

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{payment ? 'Editar Abono' : 'Nuevo Abono'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={touched && amountValue === null}
              helperText={touched && amountValue === null ? 'Número mayor a 0, hasta 2 decimales' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ flexGrow: 1 }}
              autoFocus
            />
            <TextField
              select
              label="Moneda"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              sx={{ minWidth: 110 }}
            >
              {codes.map((c) => (
                <MenuItem key={c.code} value={c.code}>
                  {c.code}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {currencyCode !== orderCurrencyCode && (
            <Typography variant="body2" color="text.secondary">
              Se convierte a {orderCurrencyCode} con el tipo de cambio del Viaje del Pedido (o el global si es {NO_TRIP_LABEL}).
            </Typography>
          )}
          <TextField
            label="Fecha"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={touched && date === ''}
            helperText={touched && date === '' ? 'Requerida' : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {payment && (
          <Button color="error" onClick={onDelete} disabled={remove.isPending} sx={{ mr: 'auto' }}>
            Eliminar
          </Button>
        )}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
