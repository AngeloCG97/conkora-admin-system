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
import { PhotoPicker } from '../ventas/PhotoPicker';

/** An Artículo a Cliente asked for. No price until it is moved to a Venta. */
export interface RequestItem {
  id: string;
  name: string;
  size: string | null;
  description: string | null;
  photo_url: string | null;
}

export const REQUEST_ITEM_FIELDS = 'id name size description photo_url';

const INSERT_ITEM = `mutation InsertRequestItem($object: customer_request_item_insert_input!) {
  insert_customer_request_item_one(object: $object) { id }
}`;

const UPDATE_ITEM = `mutation UpdateRequestItem($id: uuid!, $set: customer_request_item_set_input!) {
  update_customer_request_item_by_pk(pk_columns: { id: $id }, _set: $set) { id }
}`;

const DELETE_ITEM = `mutation DeleteRequestItem($id: uuid!) { delete_customer_request_item_by_pk(id: $id) { id } }`;

/** Create (no `item`) or edit/delete (with `item`) an Artículo of a Pedido. Mount with a `key` to reset state. */
export function RequestItemDialog({
  requestId,
  item,
  onClose,
}: {
  requestId: string;
  item?: RequestItem;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const [name, setName] = useState(item?.name ?? '');
  const [size, setSize] = useState(item?.size ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  const valid = name.trim() !== '';

  const done = (message: string) => {
    notify.success(message);
    qc.invalidateQueries({ queryKey: ['request', requestId] });
    qc.invalidateQueries({ queryKey: ['requests'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: name.trim(),
        size: size.trim() || null,
        description: description.trim() || null,
        photo_url: photoUrl,
      };
      return item
        ? gqlRequest(UPDATE_ITEM, { id: item.id, set: fields })
        : gqlRequest(INSERT_ITEM, { object: { ...fields, request_id: requestId } });
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
            error={touched && !valid}
            helperText={touched && !valid ? 'Requerido' : undefined}
            autoFocus
          />
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
