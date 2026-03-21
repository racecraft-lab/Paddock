import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Password hashing using Node.js built-in scrypt
const SALT_LENGTH = 16
const KEY_LENGTH = 32
const SCRYPT_COST = 65536
const SCRYPT_MAXMEM = 128 * SCRYPT_COST * 8 * 2 // ~128MB headroom for N=65536

// Previous cost factor — used to verify passwords hashed before the upgrade
const LEGACY_SCRYPT_COST = 16384

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST, maxmem: SCRYPT_MAXMEM }).toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against a stored hash.
 * Tries current cost first, then falls back to legacy cost for pre-upgrade hashes.
 * Returns { valid, needsRehash } so callers can progressively upgrade hashes.
 */
export function verifyPasswordWithRehashCheck(password: string, stored: string): { valid: boolean; needsRehash: boolean } {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return { valid: false, needsRehash: false }
  const storedBuf = Buffer.from(hash, 'hex')

  // Try current cost first
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST, maxmem: SCRYPT_MAXMEM })
  if (derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf)) {
    return { valid: true, needsRehash: false }
  }

  // Fall back to legacy cost for passwords hashed before the upgrade
  const legacyDerived = scryptSync(password, salt, KEY_LENGTH, { N: LEGACY_SCRYPT_COST })
  if (legacyDerived.length !== storedBuf.length) return { valid: false, needsRehash: false }
  if (timingSafeEqual(legacyDerived, storedBuf)) {
    return { valid: true, needsRehash: true }
  }
  return { valid: false, needsRehash: false }
}

export function verifyPassword(password: string, stored: string): boolean {
  return verifyPasswordWithRehashCheck(password, stored).valid
}
