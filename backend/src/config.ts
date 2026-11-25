import type { CloudinaryConfig } from './uploads/cloudinary.ts';

export interface Config {
  port: number;
  host: string;
  /** Allowed browser origins (the static frontend). */
  corsOrigins: string[];
  hasura: {
    /** e.g. http://hasura:8080/v1/graphql */
    graphqlUrl: string;
    adminSecret: string;
  };
  jwt: {
    /** HS256 key shared with Hasura (HASURA_GRAPHQL_JWT_SECRET). */
    secret: string;
    expiresInSeconds: number;
  };
  initialAdmin: {
    username: string;
    password: string;
  };
  /** Photos of Artículos; null when the three CLOUDINARY_* variables are not all set. */
  cloudinary: CloudinaryConfig | null;
  /** Reverse proxies in front of Hapi that append to X-Forwarded-For (Render: 1); 0 ignores the header. */
  trustedProxyHops: number;
}

const MIN_JWT_SECRET_LENGTH = 32;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer`);
  }
  return value;
}

function loadCloudinary(env: NodeJS.ProcessEnv): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const secret = required(env, 'JWT_SECRET');
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  return {
    port: positiveInt(env, 'PORT', 4000),
    host: env.HOST || '0.0.0.0',
    corsOrigins: required(env, 'CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    hasura: {
      graphqlUrl: required(env, 'HASURA_GRAPHQL_URL'),
      adminSecret: required(env, 'HASURA_ADMIN_SECRET'),
    },
    jwt: {
      secret,
      expiresInSeconds: positiveInt(env, 'JWT_EXPIRES_IN_SECONDS', 12 * 60 * 60),
    },
    initialAdmin: {
      username: required(env, 'ADMIN_USERNAME'),
      password: required(env, 'ADMIN_PASSWORD'),
    },
    cloudinary: loadCloudinary(env),
    trustedProxyHops: nonNegativeInt(env, 'TRUSTED_PROXY_HOPS', 0),
  };
}
