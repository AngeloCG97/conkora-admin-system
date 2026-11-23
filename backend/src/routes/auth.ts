import Boom from '@hapi/boom';
import type { ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import type { AdminUserStore } from '../auth/admin-users.ts';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../auth/passwords.ts';
import { signAccessToken } from '../auth/tokens.ts';

/** Same message for unknown user and wrong password, so usernames cannot be probed. */
export const INVALID_CREDENTIALS_MESSAGE = 'Usuario o contraseña incorrectos';

interface LoginPayload {
  username: string;
  password: string;
}

export function authRoutes(deps: {
  adminUsers: AdminUserStore;
  jwt: { secret: string; expiresInSeconds: number };
}): ServerRoute[] {
  return [
    {
      method: 'POST',
      path: '/auth/login',
      options: {
        auth: false,
        validate: {
          payload: Joi.object<LoginPayload>({
            username: Joi.string().trim().max(200).required(),
            password: Joi.string().max(200).required(),
          }),
          failAction: () => {
            throw Boom.badRequest('Usuario y contraseña son obligatorios');
          },
        },
      },
      handler: async (request) => {
        const { username, password } = request.payload as LoginPayload;
        const user = await deps.adminUsers.findByUsername(username);
        const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        if (!user || !valid) throw Boom.unauthorized(INVALID_CREDENTIALS_MESSAGE);
        return signAccessToken(user, deps.jwt);
      },
    },
  ];
}
