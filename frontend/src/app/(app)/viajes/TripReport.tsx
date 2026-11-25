'use client';

import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loading } from '@/components/feedback/Loading';
import { gqlRequest } from '@/lib/graphql';
import { DualAmount } from '@/components/money/DualAmount';

export interface TripSummary {
  order_count: number;
  income_usd: number;
  collected_usd: number;
  pending_usd: number;
  expenses_usd: number;
  profit_usd: number;
  /** Subtotals of `expenses_usd`: Gastos personales and Gastos del negocio. */
  personal_expenses_usd: number;
  business_expenses_usd: number;
  /** ₡ equivalents of each figure (Σ of the per-record ₡, each with its Viaje's rate). */
  income_crc: number;
  collected_crc: number;
  pending_crc: number;
  expenses_crc: number;
  profit_crc: number;
  personal_expenses_crc: number;
  business_expenses_crc: number;
}

/** GraphQL selection of every TripSummary field. */
export const TRIP_SUMMARY_FIELDS = `order_count income_usd collected_usd pending_usd expenses_usd profit_usd
      personal_expenses_usd business_expenses_usd
      income_crc collected_crc pending_crc expenses_crc profit_crc personal_expenses_crc business_expenses_crc`;

interface TripReportData {
  trip_by_pk: {
    summary: TripSummary | null;
    expense_categories: { category: string; expense_count: number; total_usd: number; total_crc: number }[];
    customer_summaries: {
      customer_id: string;
      order_count: number;
      total_usd: number;
      paid_usd: number;
      balance_usd: number;
      total_crc: number;
      paid_crc: number;
      balance_crc: number;
      customer: { name: string };
    }[];
  } | null;
  expense_category: { value: string; comment: string }[];
}

const REPORT_QUERY = `query TripReport($id: uuid!) {
  trip_by_pk(id: $id) {
    summary {
      ${TRIP_SUMMARY_FIELDS}
    }
    expense_categories(order_by: [{ total_usd: desc }]) { category expense_count total_usd total_crc }
    customer_summaries(order_by: [{ total_usd: desc }]) {
      customer_id order_count total_usd paid_usd balance_usd total_crc paid_crc balance_crc customer { name }
    }
  }
  expense_category { value comment }
}`;

/** Profit coloring: negative = error, otherwise success. */
export const profitColor = (n: number) => (n < 0 ? 'error.main' : 'success.main');

/** Report figure card: the USD amount and, below, its ₡ equivalent (both from the SQL views). */
export function Figure({
  label,
  usd,
  crc,
  color,
  minWidth = 140,
}: {
  label: string;
  usd: number;
  crc: number;
  color?: string;
  minWidth?: number;
}) {
  return (
    <Card variant="outlined" sx={{ flex: `1 1 ${minWidth}px` }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <DualAmount usd={usd} crc={crc} variant="h6" fontWeight={700} color={color} />
      </CardContent>
    </Card>
  );
}

// Key under ['orders', ...] so any Venta/Abono change refreshes it (see conventions).
export function TripReport({ tripId }: { tripId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['orders', 'trip-report', tripId],
    queryFn: () => gqlRequest<TripReportData>(REPORT_QUERY, { id: tripId }),
  });
  if (isPending) return <Loading />;
  const report = data?.trip_by_pk;
  const s = report?.summary;
  if (!report || !s) return null;
  const label = new Map(data.expense_category.map((c) => [c.value, c.comment]));

  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        Reporte ($ y ₡)
      </Typography>
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 1.5 }}>
        <Figure label={`Ingreso (${s.order_count} Ventas)`} usd={s.income_usd} crc={s.income_crc} />
        <Figure label="Gastos" usd={s.expenses_usd} crc={s.expenses_crc} />
        <Figure label="Utilidad" usd={s.profit_usd} crc={s.profit_crc} color={profitColor(s.profit_usd)} />
      </Stack>
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 1.5 }}>
        <Figure label="Gastos del negocio" usd={s.business_expenses_usd} crc={s.business_expenses_crc} />
        <Figure label="Gastos personales" usd={s.personal_expenses_usd} crc={s.personal_expenses_crc} />
      </Stack>
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 3 }}>
        <Figure label="Cobrado" usd={s.collected_usd} crc={s.collected_crc} />
        <Figure label="Pendiente por cobrar" usd={s.pending_usd} crc={s.pending_crc} />
      </Stack>

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Gastos por categoría
      </Typography>
      {report.expense_categories.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Aún no hay Gastos en este Viaje.
        </Typography>
      ) : (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Stack spacing={1}>
              {report.expense_categories.map((c) => (
                <Stack key={c.category} direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography>
                    {label.get(c.category) ?? c.category}{' '}
                    <Typography component="span" variant="body2" color="text.secondary">
                      ({c.expense_count})
                    </Typography>
                  </Typography>
                  <DualAmount usd={c.total_usd} crc={c.total_crc} align="right" sx={{ flexShrink: 0 }} />
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Clientes del Viaje
      </Typography>
      {report.customer_summaries.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Aún no hay Ventas en este Viaje.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {report.customer_summaries.map((c) => (
            <Card key={c.customer_id} variant="outlined">
              <CardActionArea component={Link} href={`/clientes/detalle/?id=${c.customer_id}`}>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Typography sx={{ fontWeight: 600 }}>{c.customer.name}</Typography>
                  <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: 'wrap' }}>
                    <DualAmount label="Total" usd={c.total_usd} crc={c.total_crc} variant="body2" fontWeight={400} />
                    <DualAmount label="Abono" usd={c.paid_usd} crc={c.paid_crc} variant="body2" fontWeight={400} />
                    <DualAmount label="Saldo" usd={c.balance_usd} crc={c.balance_crc} variant="body2" />
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
    </>
  );
}
