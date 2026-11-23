'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNotify } from '@/components/feedback/FeedbackProvider';
import { gqlRequest } from '@/lib/graphql';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export const CUSTOMER_FIELDS = 'id name phone email notes';

const INSERT_CUSTOMER = `mutation InsertCustomer($object: customer_insert_input!) {
  insert_customer_one(object: $object) { id }
}`;

const UPDATE_CUSTOMER = `mutation UpdateCustomer($id: uuid!, $set: customer_set_input!) {
  update_customer_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

/** Create (no `customer`) or edit (with `customer`) a Cliente. Mount with a `key` to reset state. */
export function CustomerDialog({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();

  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [touched, setTouched] = useState(false);

  const valid = name.trim() !== '';

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };
      return customer
        ? gqlRequest(UPDATE_CUSTOMER, { id: customer.id, set: fields })
        : gqlRequest(INSERT_CUSTOMER, { object: fields });
    },
    onSuccess: () => {
      notify.success(customer ? 'Cliente actualizado' : 'Cliente creado');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
      onClose();
    },
    onError: () => notify.error('No se pudo guardar el Cliente'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{customer ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={touched && !valid}
            helperText={touched && !valid ? 'Requerido' : undefined}
            autoFocus
          />
          <TextField
            label="Teléfono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'tel' } }}
          />
          <TextField
            label="Correo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
