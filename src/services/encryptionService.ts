import crypto from 'crypto';

/**
 * Kudumba Vault — Authenticated Field-Level Encryption Service
 * Implements AES-256-GCM with key versioning, 96-bit random IVs, and 128-bit authentication tags.
 *
 * Wire format for encrypted fields:
 *   enc:<version>:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Design Invariants:
 * 1. Authenticated Encryption: AES-256-GCM ensures confidentiality and integrity.
 * 2. Key Versioning: Every ciphertext explicitly identifies which key version encrypted it.
 * 3. Safe Rotation: Old keys remain available in the key ring during migration so existing data is never locked out.
 * 4. Backward Compatibility: Plaintext values without 'enc:' prefix are passed through cleanly.
 * 5. Tamper Resistance: Modified ciphertext, IV, or auth tag causes decryption to throw immediately.
 */

export interface KeyRing {
  [version: string]: Buffer;
}

export interface EncryptedPayload {
  version: string;
  ivHex: string;
  tagHex: string;
  ciphertextHex: string;
  serialized: string;
}

const DEFAULT_VERSION = 'v1';
const IV_LENGTH_BYTES = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag
const ALGORITHM = 'aes-256-gcm';

/**
 * Normalizes a 32-byte hex key string or Buffer into a 32-byte Buffer.
 * Rejects empty, weak, or improperly sized keys.
 */
export function normalizeEncryptionKey(keyInput?: string | Buffer): Buffer {
  if (!keyInput) {
    throw new Error('[Encryption] Master encryption key is missing or undefined.');
  }

  if (Buffer.isBuffer(keyInput)) {
    if (keyInput.length !== 32) {
      throw new Error(`[Encryption] Master key buffer must be exactly 32 bytes (got ${keyInput.length}).`);
    }
    return keyInput;
  }

  const clean = keyInput.trim();

  if (clean.includes('your-32-byte') || clean.includes('0123456789abcdef')) {
    throw new Error('[Encryption] Production key rejected: Insecure template placeholder key detected.');
  }

  if (clean.length === 64 && /^[0-9a-fA-F]{64}$/.test(clean)) {
    return Buffer.from(clean, 'hex');
  }

  // If provided as a raw 32-byte string
  const buf = Buffer.from(clean, 'utf8');
  if (buf.length === 32) {
    return buf;
  }

  throw new Error(
    `[Encryption] Master key must be a 64-character hexadecimal string representing 32 bytes (got length ${clean.length}).`
  );
}

/**
 * Resolves the primary encryption key from the environment.
 */
export function getPrimaryEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Encryption] Production startup aborted: ENCRYPTION_MASTER_KEY is required.');
    }
    // Safe deterministic development fallback key (32 bytes)
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  }
  return normalizeEncryptionKey(envKey);
}

/**
 * Builds the active KeyRing containing the primary key and any configured historical keys.
 * Format for ENCRYPTION_KEY_RING in environment: JSON object mapping version to hex key:
 *   ENCRYPTION_KEY_RING='{"v1":"<64-hex>","v2":"<64-hex>"}'
 */
export function getActiveKeyRing(): { primaryVersion: string; keys: KeyRing } {
  const primaryVersion = process.env.ENCRYPTION_KEY_VERSION || DEFAULT_VERSION;
  const primaryKey = getPrimaryEncryptionKey();

  const keys: KeyRing = {
    [primaryVersion]: primaryKey,
  };

  const rawRing = process.env.ENCRYPTION_KEY_RING;
  if (rawRing) {
    try {
      const parsed = JSON.parse(rawRing);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [ver, keyVal] of Object.entries(parsed)) {
          if (typeof keyVal === 'string') {
            keys[ver] = normalizeEncryptionKey(keyVal);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('[Encryption] Failed to parse ENCRYPTION_KEY_RING JSON configuration:', err);
    }
  }

  return { primaryVersion, keys };
}

/**
 * Checks whether a given string is in the versioned encrypted format.
 */
export function isEncrypted(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return val.startsWith('enc:') && val.split(':').length === 5;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a unique 96-bit random IV for every operation.
 */
export function encryptField(
  plaintext: string,
  options?: { version?: string; key?: Buffer }
): string {
  if (plaintext === null || plaintext === undefined) {
    return plaintext as any;
  }

  // Already encrypted check: do not double-encrypt
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const { primaryVersion, keys } = getActiveKeyRing();
  const version = options?.version || primaryVersion;
  const key = options?.key || keys[version];

  if (!key) {
    throw new Error(`[Encryption] Cannot encrypt: Key for version '${version}' is not configured in KeyRing.`);
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertextBuffer = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const ivHex = iv.toString('hex');
  const tagHex = authTag.toString('hex');
  const ciphertextHex = ciphertextBuffer.toString('hex');

  return `enc:${version}:${ivHex}:${tagHex}:${ciphertextHex}`;
}

/**
 * Decrypts a versioned encrypted string using AES-256-GCM.
 * Validates the authentication tag before returning any plaintext.
 * If the input is unencrypted legacy text, gracefully returns it as-is.
 */
export function decryptField(
  encryptedVal: string,
  options?: { keyRing?: KeyRing }
): string {
  if (!encryptedVal || typeof encryptedVal !== 'string') {
    return encryptedVal;
  }

  // Backward compatibility: pass unencrypted legacy data through unchanged
  if (!encryptedVal.startsWith('enc:')) {
    return encryptedVal;
  }

  const parts = encryptedVal.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc') {
    throw new Error('[Encryption] Malformed encrypted field structure.');
  }

  const [, version, ivHex, tagHex, ciphertextHex] = parts;

  const keyRing = options?.keyRing || getActiveKeyRing().keys;
  const key = keyRing[version];

  if (!key) {
    throw new Error(
      `[Encryption] Decryption failed: Key for version '${version}' is not available in KeyRing. Data cannot be decrypted without this key.`
    );
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`[Encryption] Invalid IV length: expected ${IV_LENGTH_BYTES} bytes, got ${iv.length}.`);
  }

  if (tag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error(
      `[Encryption] Invalid authentication tag length: expected ${AUTH_TAG_LENGTH_BYTES} bytes, got ${tag.length}.`
    );
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decryptedBuffer = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decryptedBuffer.toString('utf8');
  } catch (err: unknown) {
    throw new Error(
      '[Encryption] Decryption authentication failed: Ciphertext or authentication tag has been tampered with or key is invalid.'
    );
  }
}

/**
 * Re-encrypts an encrypted field to a target key version (Rotation Migration).
 * Safe and idempotent: if the record is already encrypted with the target version, it is returned unchanged.
 */
export function reencryptField(
  value: string,
  targetVersion: string,
  options?: { keyRing?: KeyRing }
): { modified: boolean; value: string } {
  if (!value || typeof value !== 'string') {
    return { modified: false, value };
  }

  // If already at target version, skip
  if (value.startsWith(`enc:${targetVersion}:`)) {
    return { modified: false, value };
  }

  // Decrypt using available keys in the key ring
  const decrypted = decryptField(value, options);

  // Encrypt with target version
  const { keys } = getActiveKeyRing();
  const ring = options?.keyRing || keys;
  const targetKey = ring[targetVersion];

  if (!targetKey) {
    throw new Error(
      `[Encryption] Re-encryption failed: Target key version '${targetVersion}' is not found in KeyRing.`
    );
  }

  const reencrypted = encryptField(decrypted, { version: targetVersion, key: targetKey });
  return { modified: true, value: reencrypted };
}
