import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const settings = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const secret = (size = 32) => randomBytes(size).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const pkceDigest = value => createHash('sha256').update(value).digest('base64url');
export const isEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value);
export const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export async function hashPassword(password) {
  const salt = secret(16);
  const hash = await derive(password, salt, 64, settings);
  return salt + '.' + hash.toString('hex');
}

const placeholderHash = 'placeholder.' + '0'.repeat(128);
export async function verifyPassword(password, stored = placeholderHash) {
  if (!validPassword(password)) return false;
  const [salt, hash] = stored.split('.');
  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(await derive(password, salt, 64, settings), expected);
}
