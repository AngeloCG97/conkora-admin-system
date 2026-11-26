'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNotify } from '@/components/feedback/FeedbackProvider';
import { formatDate, todayIso } from '@/lib/dates';
import { GraphQLRequestError, gqlRequest } from '@/lib/graphql';
import { CRC, type MoneyCurrency } from '@/lib/money';
import { NO_TRIP_LABEL } from '@/lib/terms';
import { parseAmount } from '../gastos/expenses';
import { moveTargetWhere } from '../pedidos/requests';
import type { OrderOptions } from '../ventas/OrderDialog';
import { initialSalePrice, parseSaleQuantity, stockLabel } from './inventory';
import { invalidateStock, type StockItem } from './StockItemDialog';

const TARGET_QUERY = `query SellTarget($where: order_bool_exp!) {
  order(where: $where, order_by: [{ date: desc }, { created_at: desc }], limit: 1) { id date currency { code symbol } }
}`;

const SELL_ITEM = `mutation SellStockItem($itemId: uuid!, $customerId: uuid!, $quantity: Int!, $price: numeric!, $today: date!) {
  sell_stock_item(args: { item_id: $itemId, customer_id: $customerId, quantity: $quantity, price: $price, today: $today }) { id }
}`;

type Target = { id: string; date: string; currency: MoneyCurrency };
type Customer = OrderOptions['customer'][number];

/**
 * "Vender": asks for the Cliente, the quantity (1..stock) and the unit price, and calls the SQL function
 * `sell_stock_item`, which in one transaction adds the units to the most recent Pendiente Venta of that Cliente in
 * the Artículo's Viaje (or General) — or creates one in ₡ dated today — and decrements the stock. The target shown
 * is only a preview (same rule as "Mover a Venta"); the function decides. The price starts as the Artículo's price
 * only when the target Venta has its currency. Mount with a `key` to reset state.
 */
export function SellDialog({
  item,
  tripName,
  customers,
  onClose,
}: {
  item: StockItem;
  tripName: string | null;
  customers: Customer[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quantity, setQuantity] = useState('1');
  // null = not typed yet: show the suggested price for the current target.
  const [price, setPrice] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const where = customer ? moveTargetWhere(customer.id, item.trip_id) : null;
  const target = useQuery({
    queryKey: ['orders', 'move-target', where],
    queryFn: () => gqlRequest<{ order: Target[] }>(TARGET_QUERY, { where }),
    enabled: where !== null,
  });
  const existing = target.data?.order[0] ?? null;
  const currency = existing?.currency ?? CRC;
  const targetKnown = customer !== null && target.isSuccess;

  const priceText = price ?? (targetKnown ? initialSalePrice(item.price, item.currency_code, currency.code) : '');
  const priceValue = parseAmount(priceText);
  const quantityValue = parseSaleQuantity(quantity, item.quantity);

  const sell = useMutation({
    mutationFn: () =>
      gqlRequest<{ sell_stock_item: { id: string }[] }>(SELL_ITEM, {
        itemId: item.id,
        customerId: customer!.id,
        quantity: quantityValue,
        price: priceValue,
        today: todayIso(),
      }),
    onSuccess: (res) => {
      const orderId = res.sell_stock_item[0]?.id;
      notify.success('Artículo vendido', orderId ? { label: 'Ver Venta', href: `/ventas/detalle/?id=${orderId}` } : undefined);
      invalidateStock(qc);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
      onClose();
    },
    onError: (e) => {
      // The function's own messages (not enough stock, unknown Artículo/Cliente, bad price) come back as data-exception.
      const known = e instanceof GraphQLRequestError && e.code === 'data-exception';
      notify.error(known ? e.message : 'No se pudo vender el Artículo');
      // The stock shown here may be stale (e.g. someone else sold it): refresh and close so it is reopened fresh.
      if (known) {
        invalidateStock(qc);
        onClose();
      }
    },
  });

  const submit = () => {
    setTouched(true);
    if (customer && quantityValue !== null && priceValue !== null) sell.mutate();
  };

  const tripLabel = tripName ?? NO_TRIP_LABEL;

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle>Vender</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {item.name}
            {item.size ? ` · Talla ${item.size}` : ''} · {stockLabel(item.quantity)}
          </Typography>
          <Autocomplete
            options={customers}
            value={customer}
            onChange={(_, value) => {
              setCustomer(value);
              setPrice(null);
            }}
            getOptionLabel={(c) => c.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText="Sin Clientes con ese nombre"
            renderInput={(params) => (
              <TextField
                {...params}
                label="Cliente"
                autoFocus
                error={touched && !customer}
                helperText={touched && !customer ? 'Requerido' : undefined}
              />
            )}
          />
          {!customer ? null : target.isPending ? null : target.isError ? (
            <Alert severity="warning">No se pudo consultar la Venta destino; se elegirá al confirmar.</Alert>
          ) : existing ? (
            <Typography variant="body2" color="text.secondary">
              Se agregará a la Venta Pendiente del {formatDate(existing.date)} ({tripLabel}, {existing.currency.code}).
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No hay una Venta Pendiente de este Cliente en {tripLabel}: se creará una nueva en {CRC.code} ({CRC.symbol}) con
              fecha de hoy.
            </Typography>
          )}
          <TextField
            label="Cantidad"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={touched && quantityValue === null}
            helperText={
              touched && quantityValue === null ? `Número entero de 1 a ${item.quantity}` : `Hay ${item.quantity} en inventario`
            }
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          <TextField
            label={`Precio unitario (${currency.symbol})`}
            value={priceText}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!targetKnown && !target.isError}
            error={touched && priceValue === null}
            helperText={
              touched && priceValue === null
                ? 'Número mayor o igual a 0, hasta 2 decimales'
                : `En ${currency.code}, la moneda de la Venta`
            }
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={sell.isPending || (customer !== null && target.isPending)}>
          Vender
        </Button>
      </DialogActions>
    </Dialog>
  );
}
