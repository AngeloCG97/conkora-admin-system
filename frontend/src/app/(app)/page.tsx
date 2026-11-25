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
import { DualAmount } from '@/components/money/DualAmount';
import { Figure as ReportFigure, profitColor, type TripSummary } from './viajes/TripReport';

const RECENT_TRIPS = 5;

interface RecentTrip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary: Pick<TripSummary, 'income_usd' | 'expenses_usd' | 'profit_usd' | 'profit_crc'> | null;
}

interface DashboardData {
  customer_summary_aggregate: { aggregate: { sum: { balance_usd: number | null; balance_crc: number | null } | null } };
  trip: RecentTrip[];
  no_trip_summary: Pick<
    TripSummary,
    'order_count' | 'income_usd' | 'expenses_usd' | 'pending_usd' | 'income_crc' | 'expenses_crc' | 'pending_crc'
  >[];
  business_summary: Pick<
    TripSummary,
    | 'order_count'
    | 'income_usd'
    | 'expenses_usd'
    | 'personal_expenses_usd'
    | 'profit_usd'
    | 'income_crc'
    | 'expenses_crc'
    | 'personal_expenses_crc'
    | 'profit_crc'
  >[];
}

// Everything (Utilidad global, Saldo, recent Viajes, General summary) comes from SQL views; the frontend only displays.
const DASHBOARD_QUERY = `query Dashboard {
  customer_summary_aggregate { aggregate { sum { balance_usd balance_crc } } }
  trip(order_by: [{ start_date: desc }], limit: ${RECENT_TRIPS}) {
    id name destination start_date end_date
    summary { income_usd expenses_usd profit_usd profit_crc }
  }
  no_trip_summary { order_count income_usd expenses_usd pending_usd income_crc expenses_crc pending_crc }
  business_summary {
    order_count income_usd expenses_usd personal_expenses_usd profit_usd income_crc expenses_crc personal_expenses_crc profit_crc
  }
}`;

interface ProfitData {
  trip_summary_aggregate: { aggregate: { sum: { profit_usd: number | null; profit_crc: number | null } | null } };
}

const PROFIT_QUERY = `query RecentProfit($ids: [uuid!]!) {
  trip_summary_aggregate(where: { trip_id: { _in: $ids } }) { aggregate { sum { profit_usd profit_crc } } }
}`;

function Figure(props: { label: string; usd: number; crc: number; color?: string }) {
  return <ReportFigure {...props} minWidth={150} />;
}

export default function HomePage() {
  // Keys under ['orders', ...] so Abono/Venta/Gasto changes refresh the figures (see conventions).
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

  const saldo = data?.customer_summary_aggregate.aggregate.sum;
  const recent = ids.length === 0 ? null : profit.data?.trip_summary_aggregate.aggregate.sum;
  const recentProfit = { usd: recent?.profit_usd ?? 0, crc: recent?.profit_crc ?? 0 };
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
            Todos los Viajes más lo {NO_TRIP_LABEL}, en $ y ₡ (Gastos personales incluidos).
          </Typography>
          <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 3 }}>
            <Figure label={`Ingreso (${business.order_count} Ventas)`} usd={business.income_usd} crc={business.income_crc} />
            <Figure label="Gastos" usd={business.expenses_usd} crc={business.expenses_crc} />
            <Figure label="Gastos personales" usd={business.personal_expenses_usd} crc={business.personal_expenses_crc} />
            <Figure label="Utilidad" usd={business.profit_usd} crc={business.profit_crc} color={profitColor(business.profit_usd)} />
          </Stack>
        </>
      )}
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 3 }}>
        <Figure label="Saldo total por cobrar" usd={saldo?.balance_usd ?? 0} crc={saldo?.balance_crc ?? 0} />
        <Figure
          label={`Utilidad de los últimos ${RECENT_TRIPS} Viajes`}
          usd={recentProfit.usd}
          crc={recentProfit.crc}
          color={profitColor(recentProfit.usd)}
        />
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
                  <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</Typography>
                    {t.summary && (
                      <DualAmount
                        usd={t.summary.profit_usd}
                        crc={t.summary.profit_crc}
                        fontWeight={700}
                        color={profitColor(t.summary.profit_usd)}
                        align="right"
                        sx={{ flexShrink: 0 }}
                      />
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
            Ventas y Gastos que no pertenecen a ningún Viaje, en $ y ₡.
          </Typography>
          <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Figure label={`Ingreso (${noTrip.order_count} Ventas)`} usd={noTrip.income_usd} crc={noTrip.income_crc} />
            <Figure label="Gastos" usd={noTrip.expenses_usd} crc={noTrip.expenses_crc} />
            <Figure label="Saldo" usd={noTrip.pending_usd} crc={noTrip.pending_crc} />
          </Stack>
        </>
      )}
    </>
  );
}
