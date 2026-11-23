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
import { formatMoney } from '@/lib/money';

const USD = { code: 'USD', symbol: '$' };

export const money = (n: number) => formatMoney(n, USD);

export interface TripSummary {
  order_count: number;
  income_usd: number;
  collected_usd: number;
  pending_usd: number;
  expenses_usd: number;
  profit_usd: number;
}

interface TripReportData {
  trip_by_pk: {
    summary: TripSummary | null;
    expense_categories: { category: string; expense_count: number; total_usd: number }[];
    customer_summaries: {
      customer_id: string;
      order_count: number;
      total_usd: number;
      paid_usd: number;
      balance_usd: number;
      customer: { name: string };
    }[];
  } | null;
  expense_category: { value: string; comment: string }[];
}

const REPORT_QUERY = `query TripReport($id: uuid!) {
  trip_by_pk(id: $id) {
    summary { order_count income_usd collected_usd pending_usd expenses_usd profit_usd }
    expense_categories(order_by: [{ total_usd: desc }]) { category expense_count total_usd }
    customer_summaries(order_by: [{ total_usd: desc }]) {
      customer_id order_count total_usd paid_usd balance_usd customer { name }
    }
  }
  expense_category { value comment }
}`;

/** Profit coloring: negative = error, otherwise success. */
export const profitColor = (n: number) => (n < 0 ? 'error.main' : 'success.main');

function Figure({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card variant="outlined" sx={{ flex: '1 1 140px' }}>
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

// Key under ['orders', ...] so any Pedido/Abono change refreshes it (see conventions).
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
        Reporte (USD)
      </Typography>
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 1.5 }}>
        <Figure label={`Ingreso (${s.order_count} Pedidos)`} value={s.income_usd} />
        <Figure label="Gastos" value={s.expenses_usd} />
        <Figure label="Utilidad" value={s.profit_usd} color={profitColor(s.profit_usd)} />
      </Stack>
      <Stack direction="row" useFlexGap spacing={1.5} sx={{ flexWrap: 'wrap', mb: 3 }}>
        <Figure label="Cobrado" value={s.collected_usd} />
        <Figure label="Pendiente por cobrar" value={s.pending_usd} />
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
                <Stack key={c.category} direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography>
                    {label.get(c.category) ?? c.category}{' '}
                    <Typography component="span" variant="body2" color="text.secondary">
                      ({c.expense_count})
                    </Typography>
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>{money(c.total_usd)}</Typography>
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
          Aún no hay Pedidos en este Viaje.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {report.customer_summaries.map((c) => (
            <Card key={c.customer_id} variant="outlined">
              <CardActionArea component={Link} href={`/clientes/detalle/?id=${c.customer_id}`}>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Typography sx={{ fontWeight: 600 }}>{c.customer.name}</Typography>
                  <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: 'wrap' }}>
                    <Typography variant="body2">Total {money(c.total_usd)}</Typography>
                    <Typography variant="body2">Abono {money(c.paid_usd)}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Saldo {money(c.balance_usd)}
                    </Typography>
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
