import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Format: `scrypt$N$r$p$salt(b64)$hash(b64)` – Parameter stehen im Hash, damit sich Kosten später erhöhen lassen. */
export async function hashPassword(password: string, logN = 15): Promise<string> {
  const salt = randomBytes(16);
  const N = 2 ** logN;
  const key = await scryptAsync(password, salt, N, 8, 1);
  return `scrypt$${N}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const N = Number(n);
  if (!Number.isInteger(N) || N < 1024 || N > 2 ** 20) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = await scryptAsync(password, Buffer.from(saltB64, 'base64'), N, Number(r), Number(p));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export const MIN_PASSWORD_LENGTH = 10;

export function passwordIssue(password: string): 'too_short' | 'too_long' | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password.length > 200) return 'too_long';
  return null;
}
