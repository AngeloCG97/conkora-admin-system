'use client';

import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDate } from '@/lib/dates';
import { gqlRequest } from '@/lib/graphql';
import { formatMoney } from '@/lib/money';
import { EXPENSE_FIELDS, ExpenseDialog, type Expense, type ExpenseOptions } from './ExpenseDialog';
import { expenseWhere, type ExpenseFilters, type TripFilter } from './expenses';
import { NO_TRIP_LABEL } from '@/lib/terms';

type ExpenseRow = Expense & {
  currency: { code: string; symbol: string };
  trip: { name: string } | null;
  summary: { amount_usd: number } | null;
};

interface ExpensesData {
  expense: ExpenseRow[];
  expense_summary_aggregate: { aggregate: { sum: { amount_usd: number | null } } | null };
}

const USD = { code: 'USD', symbol: '$' };

const OPTIONS_QUERY = `query ExpenseOptions {
  trip(order_by: [{ start_date: desc }]) { id name }
  currency(order_by: [{ code: asc }]) { code name symbol }
  expense_category { value comment }
}`;

const EXPENSES_QUERY = `query Expenses($where: expense_bool_exp!, $summaryWhere: expense_summary_bool_exp!) {
  expense(where: $where, order_by: [{ date: desc }, { created_at: desc }]) {
    ${EXPENSE_FIELDS}
    currency { code symbol }
    trip { name }
    summary { amount_usd }
  }
  expense_summary_aggregate(where: $summaryWhere) { aggregate { sum { amount_usd } } }
}`;

/** Select value <-> TripFilter. */
const ALL = '__all';
const GENERAL = '__general';
const tripFilterValue = (f: TripFilter) => (f.kind === 'all' ? ALL : f.kind === 'general' ? GENERAL : f.id);
const toTripFilter = (value: string): TripFilter =>
  value === ALL ? { kind: 'all' } : value === GENERAL ? { kind: 'general' } : { kind: 'trip', id: value };

/** Select value <-> Gasto personal filter (null = both). */
const PERSONAL = '__personal';
const BUSINESS = '__business';
const personalFilterValue = (p: boolean | null) => (p === null ? ALL : p ? PERSONAL : BUSINESS);
const toPersonalFilter = (value: string) => (value === ALL ? null : value === PERSONAL);

export default function ExpensesPage() {
  const [filters, setFilters] = useState<ExpenseFilters>({ trip: { kind: 'all' }, category: null, personal: null });
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);

  const options = useQuery({
    queryKey: ['expense-options'],
    queryFn: () => gqlRequest<ExpenseOptions>(OPTIONS_QUERY),
  });

  const expenses = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => {
      const where = expenseWhere(filters);
      return gqlRequest<ExpensesData>(EXPENSES_QUERY, { where, summaryWhere: where });
    },
  });

  const categoryLabel = new Map(options.data?.expense_category.map((c) => [c.value, c.comment]));
  const totalUsd = expenses.data?.expense_summary_aggregate.aggregate?.sum.amount_usd ?? 0;

  return (
    <>
      <PageHeader
        title="Gastos"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing('new')}
            disabled={!options.data}
          >
            Nuevo Gasto
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Viaje"
          value={tripFilterValue(filters.trip)}
          onChange={(e) => setFilters((f) => ({ ...f, trip: toTripFilter(e.target.value) }))}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          <MenuItem value={GENERAL}>{NO_TRIP_LABEL} (sin Viaje)</MenuItem>
          {options.data?.trip.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Categoría"
          value={filters.category ?? ALL}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value === ALL ? null : e.target.value }))}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={ALL}>Todas</MenuItem>
          {options.data?.expense_category.map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.comment}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Tipo"
          value={personalFilterValue(filters.personal)}
          onChange={(e) => setFilters((f) => ({ ...f, personal: toPersonalFilter(e.target.value) }))}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          <MenuItem value={BUSINESS}>Del negocio</MenuItem>
          <MenuItem value={PERSONAL}>Personales</MenuItem>
        </TextField>
      </Stack>

      {expenses.isPending ? (
        <Loading />
      ) : expenses.data?.expense.length === 0 ? (
        <Typography color="text.secondary">No hay Gastos con estos filtros.</Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {expenses.data?.expense.length} Gastos · Total{' '}
            <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {formatMoney(totalUsd, USD)} USD
            </Typography>
          </Typography>
          <Stack spacing={1.5}>
            {expenses.data?.expense.map((e) => (
              <Card key={e.id} variant="outlined">
                <CardActionArea onClick={() => setEditing(e)} disabled={!options.data}>
                  <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{e.description}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(e.date)} · {e.trip?.name ?? NO_TRIP_LABEL}
                      </Typography>
                      <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                        <Chip size="small" label={categoryLabel.get(e.category) ?? e.category} />
                        {e.is_personal && <Chip size="small" color="secondary" variant="outlined" label="Gasto personal" />}
                      </Stack>
                    </Stack>
                    <Stack spacing={0.5} sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{formatMoney(e.amount, e.currency)}</Typography>
                      {e.currency_code !== USD.code && (
                        <Typography variant="body2" color="text.secondary">
                          ≈ {formatMoney(e.summary?.amount_usd ?? 0, USD)} USD
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        </>
      )}

      {editing && options.data && (
        <ExpenseDialog
          key={editing === 'new' ? 'new' : editing.id}
          expense={editing === 'new' ? undefined : editing}
          options={options.data}
          defaultTripId={filters.trip.kind === 'trip' ? filters.trip.id : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
