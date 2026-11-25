'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDateRange } from '@/lib/dates';
import { GraphQLRequestError, gqlRequest } from '@/lib/graphql';
import { TRIP_FIELDS, TripDialog, type Trip } from '../TripDialog';
import { TripReport } from '../TripReport';

interface Currency {
  code: string;
  name: string;
  symbol: string;
  global_rate: number;
}

interface TripRate {
  currency_code: string;
  rate: number;
}

interface TripDetailData {
  trip_by_pk: (Trip & { rates: TripRate[] }) | null;
  currency: Currency[];
}

const BASE_CODE = 'USD';

const TRIP_QUERY = `query Trip($id: uuid!) {
  trip_by_pk(id: $id) { ${TRIP_FIELDS} rates { currency_code rate } }
  currency(where: { code: { _neq: "${BASE_CODE}" } }, order_by: [{ code: asc }]) { code name symbol global_rate }
}`;

const DELETE_TRIP = `mutation DeleteTrip($id: uuid!) { delete_trip_by_pk(id: $id) { id } }`;

const UPSERT_RATE = `mutation UpsertRate($object: trip_rate_insert_input!) {
  insert_trip_rate_one(
    object: $object
    on_conflict: { constraint: trip_rate_pkey, update_columns: [rate] }
  ) { currency_code }
}`;

const DELETE_RATE = `mutation DeleteRate($tripId: uuid!, $code: String!) {
  delete_trip_rate_by_pk(trip_id: $tripId, currency_code: $code) { currency_code }
}`;

function parseRate(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const formatRate = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 6 });

function RateDialog({
  tripId,
  currency,
  current,
  onClose,
}: {
  tripId: string;
  currency: Currency;
  current: TripRate | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const notify = useNotify();
  const [rate, setRate] = useState(current ? String(current.rate) : '');
  const [touched, setTouched] = useState(false);
  const value = parseRate(rate);

  const done = (message: string) => {
    notify.success(message);
    qc.invalidateQueries({ queryKey: ['trip', tripId] });
    qc.invalidateQueries({ queryKey: ['orders'] }); // the Viaje report depends on its rates
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      gqlRequest(UPSERT_RATE, { object: { trip_id: tripId, currency_code: currency.code, rate: value } }),
    onSuccess: () => done('Tipo de cambio del Viaje guardado'),
    onError: () => notify.error('No se pudo guardar el tipo de cambio'),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_RATE, { tripId, code: currency.code }),
    onSuccess: () => done(`${currency.code} vuelve a usar el tipo global`),
    onError: () => notify.error('No se pudo quitar el tipo de cambio'),
  });

  const submit = () => {
    setTouched(true);
    if (value !== null) save.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Tipo de cambio {currency.code} en este Viaje</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Tipo global actual: {formatRate(currency.global_rate)} {currency.code} por 1 USD
          </Typography>
          <TextField
            label={`${currency.code} por 1 USD`}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            error={touched && value === null}
            helperText={touched && value === null ? 'Debe ser un número mayor que 0' : undefined}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        {current && (
          <Button color="error" onClick={() => remove.mutate()} disabled={remove.isPending} sx={{ mr: 'auto' }}>
            Usar tipo global
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

function TripDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [rateFor, setRateFor] = useState<Currency | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['trip', id],
    queryFn: () => gqlRequest<TripDetailData>(TRIP_QUERY, { id }),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_TRIP, { id }),
    onSuccess: () => {
      notify.success('Viaje eliminado');
      qc.removeQueries({ queryKey: ['trip', id] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      router.push('/viajes/');
    },
    onError: (e) =>
      notify.error(
        e instanceof GraphQLRequestError && e.code === 'constraint-violation'
          ? 'No se puede eliminar: el Viaje tiene Gastos, Ventas o Pedidos'
          : 'No se pudo eliminar',
      ),
  });

  const onDelete = async () => {
    if (await confirm({ title: '¿Eliminar el Viaje?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  if (isPending) return <Loading />;
  const trip = data?.trip_by_pk;
  if (!trip) {
    return (
      <>
        <PageHeader title="Viaje no encontrado" />
        <Button component={Link} href="/viajes/" startIcon={<ArrowBackIcon />}>
          Volver a Viajes
        </Button>
      </>
    );
  }

  const ratesByCode = new Map(trip.rates.map((r) => [r.currency_code, r]));

  return (
    <>
      <PageHeader
        title={trip.name}
        actions={
          <Stack direction="row" spacing={1}>
            <IconButton aria-label="Editar Viaje" onClick={() => setEditing(true)}>
              <EditIcon />
            </IconButton>
            <IconButton aria-label="Eliminar Viaje" color="error" onClick={onDelete} disabled={remove.isPending}>
              <DeleteIcon />
            </IconButton>
          </Stack>
        }
      />
      <Button component={Link} href="/viajes/" startIcon={<ArrowBackIcon />} sx={{ mb: 2, mt: -2 }}>
        Viajes
      </Button>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography sx={{ fontWeight: 600 }}>{trip.destination}</Typography>
          <Typography variant="body2" color="text.secondary">
            {formatDateRange(trip.start_date, trip.end_date)}
          </Typography>
          {trip.notes && (
            <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
              {trip.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      <TripReport tripId={trip.id} />

      <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
        Tipos de cambio
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Las monedas que el Viaje no fija usan el tipo global.
      </Typography>
      <Stack spacing={1.5}>
        {data.currency.map((c) => {
          const own = ratesByCode.get(c.code);
          return (
            <Card key={c.code} variant="outlined">
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, '&:last-child': { pb: 2 } }}>
                <div style={{ flexGrow: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {c.code} · {c.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {own
                      ? `${formatRate(own.rate)} ${c.code} por 1 USD`
                      : `${formatRate(c.global_rate)} ${c.code} por 1 USD`}
                  </Typography>
                  <Chip
                    size="small"
                    sx={{ mt: 0.5 }}
                    color={own ? 'primary' : 'default'}
                    label={own ? 'Fijado en el Viaje' : 'Usa el tipo global'}
                  />
                </div>
                <IconButton aria-label={`Editar tipo de cambio ${c.code}`} onClick={() => setRateFor(c)}>
                  <EditIcon />
                </IconButton>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      {editing && <TripDialog trip={trip} onClose={() => setEditing(false)} />}
      {rateFor && (
        <RateDialog
          key={rateFor.code}
          tripId={trip.id}
          currency={rateFor}
          current={ratesByCode.get(rateFor.code)}
          onClose={() => setRateFor(null)}
        />
      )}
    </>
  );
}

function TripDetailRoute() {
  const id = useSearchParams().get('id');
  if (!id) return <PageHeader title="Viaje no encontrado" />;
  return <TripDetail id={id} />;
}

export default function TripDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TripDetailRoute />
    </Suspense>
  );
}
