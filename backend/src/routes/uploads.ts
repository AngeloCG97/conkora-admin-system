import Boom from '@hapi/boom';
import type { ServerRoute } from '@hapi/hapi';
import { jwtVerify } from 'jose';
import { createUploadSignature, type CloudinaryConfig } from '../uploads/cloudinary.ts';

export const CLOUDINARY_NOT_CONFIGURED_MESSAGE = 'Las fotos no están configuradas en el servidor (Cloudinary)';

async function requireToken(authorization: string | undefined, secret: string): Promise<void> {
  const match = /^Bearer (.+)$/i.exec(authorization ?? '');
  if (!match) throw Boom.unauthorized('Sesión requerida');
  try {
    await jwtVerify(match[1]!, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
  } catch {
    throw Boom.unauthorized('Sesión inválida o expirada');
  }
}

export function uploadRoutes(deps: {
  jwt: { secret: string };
  cloudinary?: CloudinaryConfig | null;
}): ServerRoute[] {
  return [
    {
      method: 'POST',
      path: '/uploads/signature',
      options: { auth: false },
      handler: async (request) => {
        await requireToken(request.headers.authorization as string | undefined, deps.jwt.secret);
        if (!deps.cloudinary) throw Boom.serverUnavailable(CLOUDINARY_NOT_CONFIGURED_MESSAGE);
        return createUploadSignature(deps.cloudinary);
      },
    },
  ];
}
