import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const COST_FACTOR = 12;

export async function hashSecret(password: string): Promise<string> {
  return bcrypt.hash(password, COST_FACTOR);
}

/**
 * A real hash of a random secret, made once at boot. Login compares against it
 * when no account matches the email, so "unknown email" and "wrong password"
 * take the same time. It has to be a well-formed hash: a malformed one can make
 * bcrypt return early, and that difference in timing reveals which emails exist.
 */
export const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), COST_FACTOR);

export async function secretMatches(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
