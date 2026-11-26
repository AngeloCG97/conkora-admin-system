'use client';

import AddIcon from '@mui/icons-material/Add';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
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
import { DualAmount } from '@/components/money/DualAmount';
import { gqlRequest } from '@/lib/graphql';
import { NO_TRIP_LABEL } from '@/lib/terms';
import { ORDER_OPTIONS_QUERY, type OrderOptions } from '../ventas/OrderDialog';
import { ItemPhoto } from '../ventas/ItemPhoto';
import { DEFAULT_STOCK_FILTERS, stockLabel, stockWhere, type Availability, type StockFilters } from './inventory';
import { SellDialog } from './SellDialog';
import { GENDERS_QUERY, STOCK_ITEM_FIELDS, StockItemDialog, type Gender, type StockItem } from './StockItemDialog';

type StockRow = StockItem & {
  trip: { name: string } | null;
  currency: { code: string; symbol: string };
  summary: { price_usd: number; price_crc: number } | null;
};

const STOCK_QUERY = `query StockItems($where: stock_item_bool_exp!) {
  stock_item(where: $where, order_by: [{ created_at: desc }]) {
    ${STOCK_ITEM_FIELDS}
    trip { name }
    currency { code symbol }
    summary { price_usd price_crc }
  }
}`;

const STOCK_SUMMARY_QUERY = `query StockSummary { stock_summary { item_count unit_count stock_value_usd stock_value_crc } }`;

type StockSummary = { item_count: number; unit_count: number; stock_value_usd: number; stock_value_crc: number };

const ALL = '__all';
const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: 'available', label: 'Disponibles' },
  { value: 'sold_out', label: 'Agotados' },
  { value: 'all', label: 'Todos' },
];

export default function InventoryPage() {
  const [filters, setFilters] = useState<StockFilters>(DEFAULT_STOCK_FILTERS);
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null);
  const [selling, setSelling] = useState<StockRow | null>(null);

  const options = useQuery({ queryKey: ['order-options'], queryFn: () => gqlRequest<OrderOptions>(ORDER_OPTIONS_QUERY) });
  const genders = useQuery({
    queryKey: ['item-genders'],
    queryFn: () => gqlRequest<{ item_gender: Gender[] }>(GENDERS_QUERY),
    staleTime: Infinity,
  });
  const genderLabel = (value: string) => genders.data?.item_gender.find((g) => g.value === value)?.comment ?? value;

  const where = stockWhere(filters);
  const items = useQuery({
    queryKey: ['stock-items', where],
    queryFn: () => gqlRequest<{ stock_item: StockRow[] }>(STOCK_QUERY, { where }),
    placeholderData: (prev) => prev,
  });
  const summary = useQuery({
    queryKey: ['stock-items', 'summary'],
    queryFn: () => gqlRequest<{ stock_summary: StockSummary[] }>(STOCK_SUMMARY_QUERY),
  });
  const available = summary.data?.stock_summary[0];

  return (
    <>
      <PageHeader
        title="Inventario"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing('new')}
            disabled={!options.data || !genders.data}
          >
            Nuevo Artículo
          </Button>
        }
      />
      <Typography color="text.secondary" sx={{ mb: 2, mt: -1 }}>
        Mercadería en existencia, lista para vender. Al venderla pasa a una Venta del Cliente y se descuenta.
      </Typography>

      {available && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary">
              Inventario disponible ({available.unit_count} {available.unit_count === 1 ? 'unidad' : 'unidades'}, a precio
              de venta)
            </Typography>
            <DualAmount usd={available.stock_value_usd} crc={available.stock_value_crc} variant="h6" fontWeight={700} />
          </CardContent>
        </Card>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Buscar por nombre"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          sx={{ minWidth: 200, flexGrow: 1 }}
        />
        <TextField
          select
          size="small"
          label="Estado"
          value={filters.availability}
          onChange={(e) => setFilters((f) => ({ ...f, availability: e.target.value as Availability }))}
          sx={{ minWidth: 160 }}
        >
          {AVAILABILITY.map((a) => (
            <MenuItem key={a.value} value={a.value}>
              {a.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Género"
          value={filters.gender ?? ALL}
          onChange={(e) => setFilters((f) => ({ ...f, gender: e.target.value === ALL ? null : e.target.value }))}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          {genders.data?.item_gender.map((g) => (
            <MenuItem key={g.value} value={g.value}>
              {g.comment}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {items.isPending ? (
        <Loading />
      ) : items.data?.stock_item.length === 0 ? (
        <Typography color="text.secondary">No hay Artículos de inventario con estos filtros.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {items.data?.stock_item.map((item) => {
            const soldOut = item.quantity === 0;
            return (
              <Card key={item.id} variant="outlined" sx={{ opacity: soldOut ? 0.75 : 1 }}>
                <CardActionArea onClick={() => setEditing(item)} disabled={!options.data || !genders.data}>
                  <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', pb: 1 }}>
                    <ItemPhoto url={item.photo_url} alt={item.name} />
                    <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[item.size ? `Talla ${item.size}` : null, genderLabel(item.gender), item.trip?.name ?? NO_TRIP_LABEL]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography>
                      <Chip
                        size="small"
                        label={stockLabel(item.quantity)}
                        color={soldOut ? 'default' : 'secondary'}
                        variant={soldOut ? 'outlined' : 'filled'}
                        sx={{ alignSelf: 'flex-start' }}
                      />
                    </Stack>
                    {item.summary && (
                      <DualAmount
                        amount={item.price}
                        currency={item.currency}
                        usd={item.summary.price_usd}
                        crc={item.summary.price_crc}
                        align="right"
                        sx={{ flexShrink: 0 }}
                      />
                    )}
                  </CardContent>
                </CardActionArea>
                {!soldOut && (
                  <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                    <Button
                      size="small"
                      startIcon={<PointOfSaleIcon />}
                      onClick={() => setSelling(item)}
                      disabled={!options.data}
                    >
                      Vender
                    </Button>
                  </CardActions>
                )}
              </Card>
            );
          })}
        </Stack>
      )}

      {editing && options.data && genders.data && (
        <StockItemDialog
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? undefined : editing}
          options={options.data}
          genders={genders.data.item_gender}
          onClose={() => setEditing(null)}
        />
      )}
      {selling && options.data && (
        <SellDialog
          key={selling.id}
          item={selling}
          tripName={selling.trip?.name ?? null}
          customers={options.data.customer}
          onClose={() => setSelling(null)}
        />
      )}
    </>
  );
}
