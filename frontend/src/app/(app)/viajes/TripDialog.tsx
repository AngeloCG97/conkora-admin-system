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

export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  notes: string | null;
}

export const TRIP_FIELDS = 'id name destination start_date end_date notes';

const INSERT_TRIP = `mutation InsertTrip($object: trip_insert_input!) {
  insert_trip_one(object: $object) { id }
}`;

const UPDATE_TRIP = `mutation UpdateTrip($id: uuid!, $set: trip_set_input!) {
  update_trip_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

/** Create (no `trip`) or edit (with `trip`) a Viaje. Mount with a `key` to reset state. */
export function TripDialog({ trip, onClose }: { trip?: Trip; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();

  const [name, setName] = useState(trip?.name ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startDate, setStartDate] = useState(trip?.start_date ?? '');
  const [endDate, setEndDate] = useState(trip?.end_date ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [touched, setTouched] = useState(false);

  const datesOrdered = !startDate || !endDate || startDate <= endDate;
  const valid =
    name.trim() !== '' && destination.trim() !== '' && startDate !== '' && endDate !== '' && datesOrdered;

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: name.trim(),
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || null,
      };
      return trip
        ? gqlRequest(UPDATE_TRIP, { id: trip.id, set: fields })
        : gqlRequest(INSERT_TRIP, { object: fields });
    },
    onSuccess: () => {
      notify.success(trip ? 'Viaje actualizado' : 'Viaje creado');
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['trip'] });
      onClose();
    },
    onError: () => notify.error('No se pudo guardar el Viaje'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{trip ? 'Editar Viaje' : 'Nuevo Viaje'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={touched && name.trim() === ''}
            helperText={touched && name.trim() === '' ? 'Requerido' : undefined}
            autoFocus
          />
          <TextField
            label="Destino"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            error={touched && destination.trim() === ''}
            helperText={touched && destination.trim() === '' ? 'Requerido' : undefined}
          />
          <TextField
            label="Fecha de inicio"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            error={touched && startDate === ''}
            helperText={touched && startDate === '' ? 'Requerida' : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Fecha de fin"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            error={(touched && endDate === '') || !datesOrdered}
            helperText={
              !datesOrdered
                ? 'La fecha de fin no puede ser anterior a la de inicio'
                : touched && endDate === ''
                  ? 'Requerida'
                  : undefined
            }
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
