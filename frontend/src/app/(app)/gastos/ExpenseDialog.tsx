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
import { useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { todayIso } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { parseAmount } from './expenses';

export interface Expense {
  id: string;
  trip_id: string | null;
  category: string;
  description: string;
  amount: number;
  currency_code: string;
  date: string;
}

export const EXPENSE_FIELDS = 'id trip_id category description amount currency_code date';

/** Choices for the form selects (loaded once by the page). */
export interface ExpenseOptions {
  trip: { id: string; name: string }[];
  currency: { code: string; name: string; symbol: string }[];
  expense_category: { value: string; comment: string }[];
}

const INSERT_EXPENSE = `mutation InsertExpense($object: expense_insert_input!) {
  insert_expense_one(object: $object) { id }
}`;

const UPDATE_EXPENSE = `mutation UpdateExpense($id: uuid!, $set: expense_set_input!) {
  update_expense_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const DELETE_EXPENSE = `mutation DeleteExpense($id: uuid!) { delete_expense_by_pk(id: $id) { id } }`;

const NO_TRIP = '';

/** Create (no `expense`) or edit/delete (with `expense`) a Gasto. Mount with a `key` to reset state. */
export function ExpenseDialog({
  expense,
  options,
  defaultTripId,
  onClose,
}: {
  expense?: Expense;
  options: ExpenseOptions;
  /** Viaje preselected for a new Gasto (e.g. the one being filtered). */
  defaultTripId?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const [category, setCategory] = useState(expense?.category ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [currencyCode, setCurrencyCode] = useState(expense?.currency_code ?? 'USD');
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [tripId, setTripId] = useState(expense ? (expense.trip_id ?? NO_TRIP) : (defaultTripId ?? NO_TRIP));
  const [touched, setTouched] = useState(false);

  const amountValue = parseAmount(amount);
  const valid = category !== '' && description.trim() !== '' && amountValue !== null && date !== '';

  const done = (message: string) => {
    notify.success(message);
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['orders'] }); // Viaje report lives under ['orders', ...]
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        category,
        description: description.trim(),
        amount: amountValue,
        currency_code: currencyCode,
        date,
        trip_id: tripId === NO_TRIP ? null : tripId,
      };
      return expense
        ? gqlRequest(UPDATE_EXPENSE, { id: expense.id, set: fields })
        : gqlRequest(INSERT_EXPENSE, { object: fields });
    },
    onSuccess: () => done(expense ? 'Gasto actualizado' : 'Gasto registrado'),
    onError: () => notify.error('No se pudo guardar el Gasto'),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_EXPENSE, { id: expense!.id }),
    onSuccess: () => done('Gasto eliminado'),
    onError: () => notify.error('No se pudo eliminar el Gasto'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  const onDelete = async () => {
    if (await confirm({ title: '¿Eliminar el Gasto?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{expense ? 'Editar Gasto' : 'Nuevo Gasto'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={touched && category === ''}
            helperText={touched && category === '' ? 'Requerida' : undefined}
          >
            {options.expense_category.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.comment}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={touched && description.trim() === ''}
            helperText={touched && description.trim() === '' ? 'Requerida' : undefined}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={touched && amountValue === null}
              helperText={touched && amountValue === null ? 'Número mayor o igual a 0, hasta 2 decimales' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ flexGrow: 1 }}
            />
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
        </Stack>
      </DialogContent>
      <DialogActions>
        {expense && (
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
