'use client';

import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDateRange } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { NO_TRIP_LABEL } from '@/lib/terms';
import { money, profitColor, type TripSummary } from './viajes/TripReport';

const RECENT_TRIPS = 5;

interface RecentTrip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary: Pick<TripSummary, 'income_usd' | 'expenses_usd' | 'profit_usd'> | null;
}

interface DashboardData {
  customer_summary_aggregate: { aggregate: { sum: { balance_usd: number | null } | null } };
  trip: RecentTrip[];
  no_trip_summary: Pick<TripSummary, 'order_count' | 'income_usd' | 'expenses_usd' | 'pending_usd'>[];
  business_summary: Pick<TripSummary, 'order_count' | 'income_usd' | 'expenses_usd' | 'personal_expenses_usd' | 'profit_usd'>[];
}

// Everything (Utilidad global, Saldo, recent Viajes, General summary) comes from SQL views; the frontend only displays.
const DASHBOARD_QUERY = `query Dashboard {
  customer_summary_aggregate { aggregate { sum { balance_usd } } }
  trip(order_by: [{ start_date: desc }], limit: ${RECENT_TRIPS}) {
    id name destination start_date end_date
    summary { income_usd expenses_usd profit_usd }
  }
  no_trip_summary { order_count income_usd expenses_usd pending_usd }
  business_summary { order_count income_usd expenses_usd personal_expenses_usd profit_usd }
}`;

interface ProfitData {
  trip_summary_aggregate: { aggregate: { sum: { profit_usd: number | null } | null } };
}

const PROFIT_QUERY = `query RecentProfit($ids: [uuid!]!) {
  trip_summary_aggregate(where: { trip_id: { _in: $ids } }) { aggregate { sum { profit_usd } } }
}`;

function Figure({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card variant="outlined" sx={{ flex: '1 1 150px' }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" component="p" sx={{ fontWeight: 700, color }}>
          {money(value)}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  // Keys under ['orders', ...] so Abono/Pedido/Gasto changes refresh the figures (see conventions).
  const { data, isPending } = useQuery({
    queryKey: ['orders', 'dashboard'],
    queryFn: () => gqlRequest<DashboardData>(DASHBOARD_QUERY),
  });
  const ids = data?.trip.map((t) => t.id) ?? [];
  const profit = useQuery({
    queryKey: ['orders', 'dashboard-profit', ids],
    queryFn: () => gqlRequest<ProfitData>(PROFIT_QUERY, { ids }),
    enabled: ids.length > 0,
  });

  if (isPending) return (
    <>
      <PageHeader title="Inicio" />
      <Loading />
    </>
  );

  const saldo = data?.customer_summary_aggregate.aggregate.sum?.balance_usd ?? 0;
  const recentProfit = ids.length === 0 ? 0 : (profit.data?.trip_summary_aggregate.aggregate.sum?.profit_usd ?? 0);
  const noTrip = data?.no_trip_summary[0];
  const business = data?.business_summary[0];

  return (
    <>
      <PageHeader title="Inicio" />
      {business && (
        <>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
            Utilidad global
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Todos los Viajes más lo {NO_TRIP_LABEL}, en USD (Gastos personales incluidos).
          </Typography>
          <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 3 }}>
            <Figure label={`Ingreso (${business.order_count} Pedidos)`} value={business.income_usd} />
            <Figure label="Gastos" value={business.expenses_usd} />
            <Figure label="Gastos personales" value={business.personal_expenses_usd} />
            <Figure label="Utilidad" value={business.profit_usd} color={profitColor(business.profit_usd)} />
          </Stack>
        </>
      )}
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 3 }}>
        <Figure label="Saldo total por cobrar" value={saldo} />
        <Figure label={`Utilidad de los últimos ${RECENT_TRIPS} Viajes`} value={recentProfit} color={profitColor(recentProfit)} />
      </Stack>

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Viajes recientes
      </Typography>
      {data?.trip.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Aún no hay Viajes.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {data?.trip.map((t) => (
            <Card key={t.id} variant="outlined">
              <CardActionArea component={Link} href={`/viajes/detalle/?id=${t.id}`}>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Typography sx={{ fontWeight: 600 }}>{t.name}</Typography>
                    {t.summary && (
                      <Typography sx={{ fontWeight: 700, color: profitColor(t.summary.profit_usd) }}>
                        {money(t.summary.profit_usd)}
                      </Typography>
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t.destination} · {formatDateRange(t.start_date, t.end_date)} · Utilidad
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}

      {noTrip && (
        <>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
            {NO_TRIP_LABEL} (sin Viaje)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Pedidos y Gastos que no pertenecen a ningún Viaje, en USD.
          </Typography>
          <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Figure label={`Ingreso (${noTrip.order_count} Pedidos)`} value={noTrip.income_usd} />
            <Figure label="Gastos" value={noTrip.expenses_usd} />
            <Figure label="Saldo" value={noTrip.pending_usd} />
          </Stack>
        </>
      )}
    </>
  );
}
