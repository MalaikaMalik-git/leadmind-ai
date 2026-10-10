// backend/src/utils/encryption.ts
//
// LeadMind AI — Token encryption utility (Day 22, Session 1)
// Related: SRS 2.2.4 — "User passwords and sensitive tokens (Google
// Calendar tokens, telephony API keys) must be stored securely
// (hashed/encrypted)."
//
// Passwords already get this treatment via bcrypt (one-way hashing,
// correct for something we only ever need to VERIFY). OAuth tokens are
// different — we need the actual plaintext back later to call Google's
// API on the admin's behalf, so hashing doesn't apply here; this needs
// reversible ENCRYPTION instead. AES-256-GCM is used because it's
// authenticated encryption — tampering with the stored ciphertext (e.g. a
// corrupted DB write, or someone editing the field directly) is detected
// and rejected on decrypt, rather than silently returning garbage.
//
// Key management: TOKEN_ENCRYPTION_KEY must be a 32-byte key, hex-encoded
// (64 hex characters) in the environment. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// This key must stay identical across deploys — rotating it without a
// migration plan would make every previously-stored token undecryptable.

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recommended IV length for GCM
const KEY_LENGTH_BYTES = 32; // AES-256 requires exactly a 32-byte key

function getEncryptionKey(): Buffer {
  const hexKey = process.env.TOKEN_ENCRYPTION_KEY;

  if (!hexKey) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
      'and add it to backend/.env'
    );
  }

  const key = Buffer.from(hexKey, 'hex');

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (64 hex characters) — ` +
      `got ${key.length} bytes. Check that it's a valid hex string generated the way the comment above describes.`
    );
  }

  return key;
}

/**
 * Encrypts a plaintext string (e.g. a Google OAuth access/refresh token)
 * into a single storable string: "iv:authTag:ciphertext", all hex-encoded.
 * Returns null for null/undefined input (pass-through, so callers don't
 * need to special-case "no token yet" everywhere).
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Reverses encrypt(). Returns null for null/undefined input. Throws if the
 * stored value is malformed or fails the GCM authentication check (i.e.
 * the ciphertext was tampered with or corrupted) — callers should treat a
 * thrown error here as "this token is unusable," not attempt to use a
 * partially-decrypted value.
 */
export function decrypt(encrypted: string | null | undefined): string | null {
  if (encrypted === null || encrypted === undefined) return null;

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value — expected "iv:authTag:ciphertext" format.');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}