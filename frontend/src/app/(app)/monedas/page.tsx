'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNotify } from '@/components/feedback/FeedbackProvider';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { gqlRequest } from '@/lib/graphql';

interface Currency {
  code: string;
  name: string;
  symbol: string;
  global_rate: number;
}

const CURRENCIES_QUERY = `query Currencies {
  currency(order_by: [{ code: asc }]) { code name symbol global_rate }
}`;

const INSERT_CURRENCY = `mutation InsertCurrency($object: currency_insert_input!) {
  insert_currency_one(object: $object) { code }
}`;

const UPDATE_RATE = `mutation UpdateRate($code: String!, $rate: numeric!) {
  update_currency_by_pk(pk_columns: { code: $code }, _set: { global_rate: $rate }) { code }
}`;

const BASE_CODE = 'USD';

/** Parses a user-typed rate; returns null unless it is a number > 0. */
function parseRate(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

type DialogState = { mode: 'create' } | { mode: 'edit'; currency: Currency } | null;

function CurrencyDialog({ state, onClose }: { state: NonNullable<DialogState>; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = state.mode === 'edit' ? state.currency : null;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [rate, setRate] = useState(editing ? String(editing.global_rate) : '');
  const [touched, setTouched] = useState(false);

  const codeValid = /^[A-Z]{3}$/.test(code);
  const rateValue = parseRate(rate);
  const valid = editing
    ? rateValue !== null
    : codeValid && name.trim() !== '' && symbol.trim() !== '' && rateValue !== null;

  const save = useMutation({
    mutationFn: () =>
      editing
        ? gqlRequest(UPDATE_RATE, { code: editing.code, rate: rateValue })
        : gqlRequest(INSERT_CURRENCY, {
            object: { code, name: name.trim(), symbol: symbol.trim(), global_rate: rateValue },
          }),
    onSuccess: () => {
      notify.success(editing ? 'Tipo de cambio actualizado' : 'Moneda agregada');
      qc.invalidateQueries({ queryKey: ['currencies'] });
      onClose();
    },
    onError: () => notify.error(editing ? 'No se pudo actualizar' : 'No se pudo agregar (¿el código ya existe?)'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle>{editing ? `Editar ${editing.code}` : 'Nueva moneda'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!editing && (
            <>
              <TextField
                label="Código ISO"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))}
                error={touched && !codeValid}
                helperText={touched && !codeValid ? 'Debe tener 3 letras (ej. EUR)' : 'Ej. EUR, MXN'}
                autoFocus
              />
              <TextField
                label="Nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={touched && name.trim() === ''}
              />
              <TextField
                label="Símbolo"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                error={touched && symbol.trim() === ''}
              />
            </>
          )}
          <TextField
            label="Tipo de cambio global (por 1 USD)"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            error={touched && rateValue === null}
            helperText={touched && rateValue === null ? 'Debe ser un número mayor que 0' : undefined}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            autoFocus={!!editing}
          />
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

export default function CurrenciesPage() {
  const [dialog, setDialog] = useState<DialogState>(null);
  const { data, isPending } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => gqlRequest<{ currency: Currency[] }>(CURRENCIES_QUERY),
  });

  return (
    <>
      <PageHeader
        title="Monedas"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ mode: 'create' })}>
            Nueva moneda
          </Button>
        }
      />
      {isPending ? (
        <Loading />
      ) : (
        <Stack spacing={1.5}>
          {data?.currency.map((c) => (
            <Card key={c.code} variant="outlined">
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="h5" sx={{ minWidth: 40, textAlign: 'center' }}>
                  {c.symbol}
                </Typography>
                <div style={{ flexGrow: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {c.code} · {c.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {c.code === BASE_CODE
                      ? 'Moneda base · tipo fijo 1'
                      : `${c.global_rate.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${c.code} por 1 USD`}
                  </Typography>
                </div>
                {c.code !== BASE_CODE && (
                  <IconButton aria-label={`Editar ${c.code}`} onClick={() => setDialog({ mode: 'edit', currency: c })}>
                    <EditIcon />
                  </IconButton>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {dialog && <CurrencyDialog key={dialog.mode === 'edit' ? dialog.currency.code : 'new'} state={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
