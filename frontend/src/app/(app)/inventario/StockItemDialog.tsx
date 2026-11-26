'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { gqlRequest } from '@/lib/graphql';
import { NO_TRIP_LABEL } from '@/lib/terms';
import { parseAmount } from '../gastos/expenses';
import type { OrderOptions } from '../ventas/OrderDialog';
import { PhotoPicker } from '../ventas/PhotoPicker';
import { parseStockQuantity } from './inventory';

/** An Artículo de inventario: merchandise in stock with its unit sale price. */
export interface StockItem {
  id: string;
  name: string;
  description: string | null;
  size: string | null;
  gender: string;
  photo_url: string | null;
  price: number;
  currency_code: string;
  quantity: number;
  trip_id: string | null;
}

export const STOCK_ITEM_FIELDS = 'id name description size gender photo_url price currency_code quantity trip_id';

export type Gender = { value: string; comment: string };

export const GENDERS_QUERY = `query ItemGenders { item_gender { value comment } }`;

const INSERT_ITEM = `mutation InsertStockItem($object: stock_item_insert_input!) {
  insert_stock_item_one(object: $object) { id }
}`;

const UPDATE_ITEM = `mutation UpdateStockItem($id: uuid!, $set: stock_item_set_input!) {
  update_stock_item_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const DELETE_ITEM = `mutation DeleteStockItem($id: uuid!) { delete_stock_item_by_pk(id: $id) { id } }`;

const NO_TRIP = '';

/**
 * Invalidates everything that shows inventario: the list and header (['stock-items', ...]) and the Inicio
 * dashboard (Utilidad proyectada, key ['orders', 'dashboard']).
 */
export function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['stock-items'] });
  qc.invalidateQueries({ queryKey: ['orders', 'dashboard'] });
}

/** Create (no `item`) or edit/delete (with `item`) an Artículo de inventario. Mount with a `key` to reset state. */
export function StockItemDialog({
  item,
  options,
  genders,
  onClose,
}: {
  item?: StockItem;
  options: OrderOptions;
  genders: Gender[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const [name, setName] = useState(item?.name ?? '');
  const [size, setSize] = useState(item?.size ?? '');
  const [gender, setGender] = useState(item?.gender ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [currencyCode, setCurrencyCode] = useState(item?.currency_code ?? 'CRC');
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : '1');
  const [tripId, setTripId] = useState(item?.trip_id ?? NO_TRIP);
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  const priceValue = parseAmount(price);
  const quantityValue = parseStockQuantity(quantity);
  const errors = {
    name: name.trim() === '',
    gender: gender === '',
    price: priceValue === null,
    quantity: quantityValue === null,
  };
  const valid = !Object.values(errors).some(Boolean);

  const done = (message: string) => {
    notify.success(message);
    invalidateStock(qc);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: name.trim(),
        size: size.trim() || null,
        gender,
        description: description.trim() || null,
        price: priceValue,
        currency_code: currencyCode,
        quantity: quantityValue,
        trip_id: tripId === NO_TRIP ? null : tripId,
        photo_url: photoUrl,
      };
      return item ? gqlRequest(UPDATE_ITEM, { id: item.id, set: fields }) : gqlRequest(INSERT_ITEM, { object: fields });
    },
    onSuccess: () => done(item ? 'Artículo actualizado' : 'Artículo agregado al inventario'),
    onError: () => notify.error('No se pudo guardar el Artículo'),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_ITEM, { id: item!.id }),
    onSuccess: () => done('Artículo eliminado del inventario'),
    onError: () => notify.error('No se pudo eliminar el Artículo'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar el Artículo del inventario?',
      message: 'Las Ventas donde ya se vendió no cambian. Para conservarlo como historial, deja la cantidad en 0.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{item ? 'Editar Artículo de inventario' : 'Nuevo Artículo de inventario'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={touched && errors.name}
            helperText={touched && errors.name ? 'Requerido' : undefined}
            autoFocus
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Talla (opcional)" value={size} onChange={(e) => setSize(e.target.value)} sx={{ flex: 1 }} />
            <TextField
              select
              label="Género"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              error={touched && errors.gender}
              helperText={touched && errors.gender ? 'Requerido' : undefined}
              sx={{ flex: 1 }}
            >
              {genders.map((g) => (
                <MenuItem key={g.value} value={g.value}>
                  {g.comment}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Precio de venta"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={touched && errors.price}
              helperText={touched && errors.price ? 'Número mayor o igual a 0, hasta 2 decimales' : 'Por unidad'}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Moneda"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              sx={{ minWidth: { sm: 110 } }}
            >
              {options.currency.map((c) => (
                <MenuItem key={c.code} value={c.code}>
                  {c.code}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Cantidad"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={touched && errors.quantity}
            helperText={touched && errors.quantity ? 'Número entero mayor o igual a 0' : '0 = Agotado (se conserva en la lista)'}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          <TextField
            select
            label="Viaje"
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            helperText={`Donde se compró. Sin Viaje = ${NO_TRIP_LABEL} (usa el tipo de cambio global)`}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value={NO_TRIP}>{NO_TRIP_LABEL} (sin Viaje)</MenuItem>
            {options.trip.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
          />
          <PhotoPicker url={photoUrl} alt={name} onChange={setPhotoUrl} onUploadingChange={setUploading} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {item && (
          <Button color="error" onClick={onDelete} disabled={remove.isPending} sx={{ mr: 'auto' }}>
            Eliminar
          </Button>
        )}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending || uploading}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
