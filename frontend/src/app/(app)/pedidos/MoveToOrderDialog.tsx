'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNotify } from '@/components/feedback/FeedbackProvider';
import { formatDate, todayIso } from '@/lib/dates';
import { GraphQLRequestError, gqlRequest } from '@/lib/graphql';
import { CRC, type MoneyCurrency } from '@/lib/money';
import { NO_TRIP_LABEL } from '@/lib/terms';
import { parseAmount } from '../gastos/expenses';
import type { RequestItem } from './RequestItemDialog';
import { moveTargetWhere } from './requests';

const TARGET_QUERY = `query MoveTarget($where: order_bool_exp!) {
  order(where: $where, order_by: [{ date: desc }, { created_at: desc }], limit: 1) { id date currency { code symbol } }
}`;

const MOVE_ITEM = `mutation MoveRequestItem($itemId: uuid!, $price: numeric!, $today: date!) {
  move_request_item_to_order(args: { item_id: $itemId, price: $price, today: $today }) { id }
}`;

type Target = { id: string; date: string; currency: MoneyCurrency };

/**
 * "Mover a Venta": asks only for the price and calls the SQL function `move_request_item_to_order`, which in one
 * transaction adds the Artículo (quantity 1) to the most recent Pendiente Venta of the same Cliente and Viaje — or
 * creates one in ₡ dated today — and deletes it from the Pedido. The target shown here is only a preview (key
 * under ['orders', ...] so Venta changes refresh it); the function decides. Mount with a `key` to reset state.
 */
export function MoveToOrderDialog({
  requestId,
  customerId,
  tripId,
  tripName,
  item,
  onClose,
}: {
  requestId: string;
  customerId: string;
  tripId: string | null;
  tripName: string | null;
  item: RequestItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const notify = useNotify();
  const [price, setPrice] = useState('');
  const [touched, setTouched] = useState(false);

  const where = moveTargetWhere(customerId, tripId);
  const target = useQuery({
    queryKey: ['orders', 'move-target', where],
    queryFn: () => gqlRequest<{ order: Target[] }>(TARGET_QUERY, { where }),
  });
  const existing = target.data?.order[0] ?? null;
  const currency = existing?.currency ?? CRC;

  const priceValue = parseAmount(price);

  const move = useMutation({
    mutationFn: () =>
      gqlRequest<{ move_request_item_to_order: { id: string }[] }>(MOVE_ITEM, {
        itemId: item.id,
        price: priceValue,
        today: todayIso(),
      }),
    onSuccess: (res) => {
      const orderId = res.move_request_item_to_order[0]?.id;
      notify.success('Artículo movido a la Venta', orderId ? { label: 'Ver Venta', href: `/ventas/detalle/?id=${orderId}` } : undefined);
      qc.invalidateQueries({ queryKey: ['request', requestId] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
      onClose();
    },
    onError: (e) => {
      // The function's own messages (unknown/already moved Artículo, bad price) come back as data-exception.
      const known = e instanceof GraphQLRequestError && e.code === 'data-exception';
      notify.error(known ? e.message : 'No se pudo mover el Artículo');
      if (known) {
        qc.invalidateQueries({ queryKey: ['request', requestId] });
        onClose();
      }
    },
  });

  const submit = () => {
    setTouched(true);
    if (priceValue !== null) move.mutate();
  };

  const tripLabel = tripName ?? NO_TRIP_LABEL;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Mover a Venta</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {item.name}
            {item.size ? ` · Talla ${item.size}` : ''}
          </Typography>
          {target.isPending ? null : target.isError ? (
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
            label={`Precio (${currency.symbol})`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={touched && priceValue === null}
            helperText={touched && priceValue === null ? 'Número mayor o igual a 0, hasta 2 decimales' : `En ${currency.code}, cantidad 1`}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={move.isPending || target.isPending}>
          Mover
        </Button>
      </DialogActions>
    </Dialog>
  );
}
