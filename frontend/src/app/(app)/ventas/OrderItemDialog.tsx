'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm, useNotify } from '@/components/feedback/FeedbackProvider';
import { gqlRequest } from '@/lib/graphql';
import { parseAmount } from '../gastos/expenses';
import { parseQuantity } from './orders';
import { PhotoPicker } from './PhotoPicker';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  size: string | null;
  description: string | null;
  photo_url: string | null;
}

export const ORDER_ITEM_FIELDS = 'id name price quantity size description photo_url';

const INSERT_ITEM = `mutation InsertOrderItem($object: order_item_insert_input!) {
  insert_order_item_one(object: $object) { id }
}`;

const UPDATE_ITEM = `mutation UpdateOrderItem($id: uuid!, $set: order_item_set_input!) {
  update_order_item_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const DELETE_ITEM = `mutation DeleteOrderItem($id: uuid!) { delete_order_item_by_pk(id: $id) { id } }`;

/**
 * Create (no `item`) or edit/delete (with `item`) an Artículo of a Venta. The price is in the Venta's
 * currency (`currencyCode`, shown only as a label). Mount with a `key` to reset state.
 */
export function OrderItemDialog({
  orderId,
  currencyCode,
  item,
  onClose,
}: {
  orderId: string;
  currencyCode: string;
  item?: OrderItem;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : '1');
  const [size, setSize] = useState(item?.size ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  const priceValue = parseAmount(price);
  const quantityValue = parseQuantity(quantity);
  const valid = name.trim() !== '' && priceValue !== null && quantityValue !== null;

  const done = (message: string) => {
    notify.success(message);
    qc.invalidateQueries({ queryKey: ['order', orderId] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: name.trim(),
        price: priceValue,
        quantity: quantityValue,
        size: size.trim() || null,
        description: description.trim() || null,
        photo_url: photoUrl,
      };
      return item
        ? gqlRequest(UPDATE_ITEM, { id: item.id, set: fields })
        : gqlRequest(INSERT_ITEM, { object: { ...fields, order_id: orderId } });
    },
    onSuccess: () => done(item ? 'Artículo actualizado' : 'Artículo agregado'),
    onError: () => notify.error('No se pudo guardar el Artículo'),
  });

  const remove = useMutation({
    mutationFn: () => gqlRequest(DELETE_ITEM, { id: item!.id }),
    onSuccess: () => done('Artículo eliminado'),
    onError: () => notify.error('No se pudo eliminar el Artículo'),
  });

  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };

  const onDelete = async () => {
    if (await confirm({ title: '¿Eliminar el Artículo?', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>{item ? 'Editar Artículo' : 'Nuevo Artículo'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={touched && name.trim() === ''}
            helperText={touched && name.trim() === '' ? 'Requerido' : undefined}
            autoFocus
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label={`Precio (${currencyCode})`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={touched && priceValue === null}
              helperText={touched && priceValue === null ? 'Número mayor o igual a 0, hasta 2 decimales' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              label="Cantidad"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              error={touched && quantityValue === null}
              helperText={touched && quantityValue === null ? 'Entero mayor a 0' : undefined}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              sx={{ width: 130 }}
            />
          </Stack>
          <TextField label="Talla (opcional)" value={size} onChange={(e) => setSize(e.target.value)} />
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
