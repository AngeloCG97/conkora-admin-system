'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useRef, useState } from 'react';
import { PhotoUploadError, uploadPhoto } from '@/lib/photos';
import { ItemPhoto } from './ItemPhoto';

/**
 * Photo field of an Artículo form (Venta or Pedido): thumbnail + add/change/remove. Uploads straight to
 * Cloudinary (`uploadPhoto`) and reports the `secure_url` through `onChange`; `onUploadingChange` lets the
 * dialog disable "Guardar" while a file is uploading.
 */
export function PhotoPicker({
  url,
  alt,
  onChange,
  onUploadingChange,
}: {
  url: string | null;
  alt: string;
  onChange: (url: string | null) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange(busy);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadPhoto(file));
    } catch (e) {
      setError(e instanceof PhotoUploadError ? e.message : 'No se pudo subir la foto');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <ItemPhoto url={url} alt={alt || 'Foto del Artículo'} size={80} />
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outlined" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? 'Subiendo…' : url ? 'Cambiar foto' : 'Agregar foto'}
        </Button>
        {url && !uploading && (
          <Button color="error" onClick={() => onChange(null)}>
            Quitar foto
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </>
  );
}
