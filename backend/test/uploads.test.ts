import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '../src/auth/tokens.ts';
import { loadConfig } from '../src/config.ts';
import { CLOUDINARY_NOT_CONFIGURED_MESSAGE } from '../src/routes/uploads.ts';
import { createServer } from '../src/server.ts';
import { createUploadSignature, signCloudinaryParams } from '../src/uploads/cloudinary.ts';

const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
const CLOUDINARY = { cloudName: 'demo', apiKey: '123456', apiSecret: 'abcd' };

function buildServer(cloudinary: typeof CLOUDINARY | null) {
  return createServer({
    config: {
      port: 0,
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      jwt: { secret: JWT_SECRET, expiresInSeconds: 3600 },
      cloudinary,
    },
    adminUsers: { findByUsername: async () => null, count: async () => 0, create: async () => {} },
  });
}

const validToken = async () =>
  (await signAccessToken({ id: 'u1', username: 'ana' }, { secret: JWT_SECRET, expiresInSeconds: 3600 })).token;

describe('signCloudinaryParams', () => {
  it('matches the example from the Cloudinary docs (params sorted, secret appended, SHA-1)', () => {
    // https://cloudinary.com/documentation/authentication_signatures
    const signature = signCloudinaryParams(
      { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' },
      'abcd',
    );
    expect(signature).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('sorts by parameter name regardless of insertion order', () => {
    expect(signCloudinaryParams({ timestamp: 5, folder: 'f' }, 's')).toBe(
      createHash('sha1').update('folder=f&timestamp=5s').digest('hex'),
    );
  });
});

describe('createUploadSignature', () => {
  it('signs folder and timestamp, never exposing the secret', () => {
    const result = createUploadSignature(CLOUDINARY, new Date('2026-01-01T00:00:00Z'));
    expect(result.timestamp).toBe(1767225600);
    expect(result.signature).toBe(
      createHash('sha1').update(`folder=${result.folder}&timestamp=1767225600abcd`).digest('hex'),
    );
    expect(JSON.stringify(result)).not.toContain('abcd');
    expect(result).toMatchObject({ cloudName: 'demo', apiKey: '123456' });
  });
});

describe('POST /uploads/signature', () => {
  it('returns 401 without a token', async () => {
    const res = await buildServer(CLOUDINARY).inject({ method: 'POST', url: '/uploads/signature' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with another secret or expired', async () => {
    const wrong = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h')
      .sign(new TextEncoder().encode('another-secret-that-is-at-least-32-chars!!'));
    const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(JWT_SECRET));
    for (const token of [wrong, expired, 'garbage']) {
      const res = await buildServer(CLOUDINARY).inject({
        method: 'POST', url: '/uploads/signature', headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('returns 503 with a clear message when Cloudinary is not configured', async () => {
    const res = await buildServer(null).inject({
      method: 'POST', url: '/uploads/signature', headers: { authorization: `Bearer ${await validToken()}` },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).message).toBe(CLOUDINARY_NOT_CONFIGURED_MESSAGE);
  });

  it('returns the signed payload for a valid token', async () => {
    const res = await buildServer(CLOUDINARY).inject({
      method: 'POST', url: '/uploads/signature', headers: { authorization: `Bearer ${await validToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toMatchObject({ cloudName: 'demo', apiKey: '123456' });
    expect(body.signature).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('loadConfig cloudinary', () => {
  const base = {
    JWT_SECRET, CORS_ORIGIN: 'x', HASURA_GRAPHQL_URL: 'x', HASURA_ADMIN_SECRET: 'x', ADMIN_USERNAME: 'a', ADMIN_PASSWORD: 'b',
  };
  it('is null unless the three variables are set', () => {
    expect(loadConfig({ ...base }).cloudinary).toBeNull();
    expect(loadConfig({ ...base, CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: '' }).cloudinary).toBeNull();
    expect(loadConfig({ ...base, CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }).cloudinary)
      .toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
  });
});
