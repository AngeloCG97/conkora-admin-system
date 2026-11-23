import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Hash compared against when the username does not exist, so a login attempt
 * takes the same time whether or not the user exists.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('conkora-dummy-password', BCRYPT_COST);
