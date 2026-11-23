'use client';

import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDateRange } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { TRIP_FIELDS, TripDialog, type Trip } from './TripDialog';
import { money, profitColor, type TripSummary } from './TripReport';

const TRIPS_QUERY = `query Trips {
  trip(order_by: [{ start_date: desc }]) { ${TRIP_FIELDS} }
}`;

// Separate query under ['orders', ...] so Pedido/Abono/Gasto changes refresh the figures.
const SUMMARIES_QUERY = `query TripSummaries {
  trip { id summary { income_usd expenses_usd profit_usd } }
}`;

type ListSummary = Pick<TripSummary, 'income_usd' | 'expenses_usd' | 'profit_usd'>;

export default function TripsPage() {
  const [creating, setCreating] = useState(false);
  const { data, isPending } = useQuery({
    queryKey: ['trips'],
    queryFn: () => gqlRequest<{ trip: Trip[] }>(TRIPS_QUERY),
  });

  const summaries = useQuery({
    queryKey: ['orders', 'trip-summaries'],
    queryFn: () => gqlRequest<{ trip: { id: string; summary: ListSummary | null }[] }>(SUMMARIES_QUERY),
  });
  const summaryById = new Map(summaries.data?.trip.map((t) => [t.id, t.summary]));

  return (
    <>
      <PageHeader
        title="Viajes"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            Nuevo Viaje
          </Button>
        }
      />
      {isPending ? (
        <Loading />
      ) : data?.trip.length === 0 ? (
        <Typography color="text.secondary">Aún no hay Viajes. Crea el primero con «Nuevo Viaje».</Typography>
      ) : (
        <Stack spacing={1.5}>
          {data?.trip.map((t) => (
            <Card key={t.id} variant="outlined">
              <CardActionArea component={Link} href={`/viajes/detalle/?id=${t.id}`}>
                <CardContent>
                  <Typography sx={{ fontWeight: 600 }}>{t.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t.destination} · {formatDateRange(t.start_date, t.end_date)}
                  </Typography>
                  {summaryById.get(t.id) && (
                    <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                      <Typography variant="body2">Ingreso {money(summaryById.get(t.id)!.income_usd)}</Typography>
                      <Typography variant="body2">Gastos {money(summaryById.get(t.id)!.expenses_usd)}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: profitColor(summaryById.get(t.id)!.profit_usd) }}>
                        Utilidad {money(summaryById.get(t.id)!.profit_usd)}
                      </Typography>
                    </Stack>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      {creating && <TripDialog onClose={() => setCreating(false)} />}
    </>
  );
}
