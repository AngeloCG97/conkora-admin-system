import { config } from './config';
import { getSession } from './session';
import { fetchWhileWaking } from './wake';

/** Photos of Artículos live in Cloudinary; the DB only stores the `secure_url` (order_item.photo_url). */

export type PhotoErrorCode = 'not-configured' | 'session' | 'failed';

const MESSAGES: Record<PhotoErrorCode, string> = {
  'not-configured': 'Las fotos todavía no están configuradas en el servidor (Cloudinary)',
  session: 'Tu sesión expiró. Inicia sesión de nuevo',
  failed: 'No se pudo subir la foto',
};

export class PhotoUploadError extends Error {
  readonly code: PhotoErrorCode;
  constructor(code: PhotoErrorCode) {
    super(MESSAGES[code]);
    this.code = code;
  }
}

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

async function requestSignature(token: string): Promise<UploadSignature> {
  let response: Response;
  try {
    response = await fetchWhileWaking((signal) =>
      fetch(`${config.apiUrl}/uploads/signature`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal }),
    );
  } catch {
    throw new PhotoUploadError('failed');
  }
  if (response.status === 503) throw new PhotoUploadError('not-configured');
  if (response.status === 401) throw new PhotoUploadError('session');
  if (!response.ok) throw new PhotoUploadError('failed');
  return (await response.json()) as UploadSignature;
}

/** Uploads `file` straight from the browser to Cloudinary (signed by Hapi) and returns its https URL. */
export async function uploadPhoto(file: File): Promise<string> {
  const token = getSession()?.token;
  if (!token) throw new PhotoUploadError('session');
  const sig = await requestSignature(token);

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('folder', sig.folder);
  form.append('signature', sig.signature);

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloudName)}/image/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new PhotoUploadError('failed');
  }
  if (!response.ok) throw new PhotoUploadError('failed');
  const { secure_url: url } = (await response.json()) as { secure_url?: string };
  if (!url) throw new PhotoUploadError('failed');
  return url;
}

/** Cloudinary delivery URL resized to a square thumbnail; other URLs are returned unchanged. */
export function thumbnailUrl(url: string, size = 160): string {
  const marker = '/image/upload/';
  if (!url.startsWith('https://res.cloudinary.com/') || !url.includes(marker)) return url;
  return url.replace(marker, `${marker}c_fill,w_${size},h_${size},q_auto,f_auto/`);
}
