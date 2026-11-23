import { createHash } from 'node:crypto';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Folder (in Cloudinary) where Artículo photos are uploaded. */
export const PHOTOS_FOLDER = 'conkora/articulos';

/**
 * Cloudinary signed-upload signature: parameters (without file, api_key, resource_type, cloud_name),
 * sorted by name, joined as `k=v&k=v`, the API secret appended, SHA-1 in hex.
 */
export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/** Short-lived payload the browser needs to upload one image directly to Cloudinary. */
export function createUploadSignature(config: CloudinaryConfig, now: Date = new Date()): UploadSignature {
  const timestamp = Math.floor(now.getTime() / 1000);
  const folder = PHOTOS_FOLDER;
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder,
    signature: signCloudinaryParams({ folder, timestamp }, config.apiSecret),
  };
}
