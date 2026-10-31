import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  encryptField,
  decryptField,
  reencryptField,
  normalizeEncryptionKey,
  getActiveKeyRing,
  isEncrypted,
} from './encryptionService';

describe('Kudumba Vault — Authenticated Field-Level Encryption & Key Lifecycle Suite', () => {
  const KEY_V1 = Buffer.from('1111111111111111111111111111111111111111111111111111111111111111', 'hex');
  const KEY_V2 = Buffer.from('2222222222222222222222222222222222222222222222222222222222222222', 'hex');

  const customKeyRing = {
    v1: KEY_V1,
    v2: KEY_V2,
  };

  it('1. Encrypts plaintext into authenticated versioned wire format', () => {
    const plaintext = 'Secret Document Number: 8492-2014-9988';
    const encrypted = encryptField(plaintext, { version: 'v1', key: KEY_V1 });

    assert.ok(isEncrypted(encrypted), 'Must match encrypted wire format');
    const parts = encrypted.split(':');
    assert.equal(parts.length, 5);
    assert.equal(parts[0], 'enc');
    assert.equal(parts[1], 'v1');
    assert.equal(parts[2].length, 24, '12-byte IV in hex is 24 chars');
    assert.equal(parts[3].length, 32, '16-byte Auth Tag in hex is 32 chars');
    assert.ok(parts[4].length > 0, 'Ciphertext must be present');
  });

  it('2. Semantic security: Encrypting the same plaintext twice produces unique IVs and ciphertexts', () => {
    const plaintext = 'Aadhaar: 1234 5678 9012';
    const enc1 = encryptField(plaintext, { version: 'v1', key: KEY_V1 });
    const enc2 = encryptField(plaintext, { version: 'v1', key: KEY_V1 });

    assert.notEqual(enc1, enc2, 'Two encryptions of same plaintext must differ due to random IV');
    const iv1 = enc1.split(':')[2];
    const iv2 = enc2.split(':')[2];
    assert.notEqual(iv1, iv2, 'IVs must be uniquely generated for every encryption operation');
  });

  it('3. Decrypts authenticated ciphertext cleanly back to original plaintext', () => {
    const sensitive = 'Sensitive Passport ID: M8492014';
    const encrypted = encryptField(sensitive, { version: 'v1', key: KEY_V1 });
    const decrypted = decryptField(encrypted, { keyRing: customKeyRing });

    assert.equal(decrypted, sensitive);
  });

  it('4. Rejects tampered ciphertext with cryptographic authentication error', () => {
    const plaintext = 'Critical Bank Account: 9988776655';
    const encrypted = encryptField(plaintext, { version: 'v1', key: KEY_V1 });
    const parts = encrypted.split(':');

    // Tamper with one character of ciphertext
    const tamperedCipher = parts[4].slice(0, -2) + (parts[4].endsWith('aa') ? 'bb' : 'aa');
    const tamperedPayload = `enc:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedCipher}`;

    assert.throws(
      () => decryptField(tamperedPayload, { keyRing: customKeyRing }),
      /Decryption authentication failed/i
    );
  });

  it('5. Rejects tampered authentication tag (integrity defense)', () => {
    const plaintext = 'Critical Bank Account: 9988776655';
    const encrypted = encryptField(plaintext, { version: 'v1', key: KEY_V1 });
    const parts = encrypted.split(':');

    // Tamper with authentication tag
    const tamperedTag = parts[3].slice(0, -2) + '00';
    const tamperedPayload = `enc:${parts[1]}:${parts[2]}:${tamperedTag}:${parts[4]}`;

    assert.throws(
      () => decryptField(tamperedPayload, { keyRing: customKeyRing }),
      /Decryption authentication failed/i
    );
  });

  it('6. Rejects tampered IV / nonce', () => {
    const plaintext = 'Confidential Insurance Policy #554433';
    const encrypted = encryptField(plaintext, { version: 'v1', key: KEY_V1 });
    const parts = encrypted.split(':');

    // Tamper with IV
    const tamperedIv = parts[2].slice(0, -2) + 'ff';
    const tamperedPayload = `enc:${parts[1]}:${tamperedIv}:${parts[3]}:${parts[4]}`;

    assert.throws(
      () => decryptField(tamperedPayload, { keyRing: customKeyRing }),
      /Decryption authentication failed/i
    );
  });

  it('7. Backward compatibility: Unencrypted legacy text is returned without modification', () => {
    const legacyPlaintext = 'Old Unencrypted Document 1998';
    const result = decryptField(legacyPlaintext, { keyRing: customKeyRing });
    assert.equal(result, legacyPlaintext);
  });

  it('8. Multi-key rotation support: Can decrypt v1 record while v2 is active', () => {
    // Encrypt record with key v1
    const v1Record = encryptField('Old Family Record', { version: 'v1', key: KEY_V1 });
    assert.ok(v1Record.startsWith('enc:v1:'));

    // Decrypt using keyRing containing both v1 and v2
    const decrypted = decryptField(v1Record, { keyRing: customKeyRing });
    assert.equal(decrypted, 'Old Family Record');
  });

  it('9. Re-encryption migration: Atomically migrates v1 record to v2', () => {
    const originalText = 'Passport Expiry: 2035-12-31';
    const v1Record = encryptField(originalText, { version: 'v1', key: KEY_V1 });
    assert.ok(v1Record.startsWith('enc:v1:'));

    // Migrate to v2
    const migration = reencryptField(v1Record, 'v2', { keyRing: customKeyRing });
    assert.equal(migration.modified, true);
    assert.ok(migration.value.startsWith('enc:v2:'), 'Migrated value must carry v2 prefix');

    // Verify v2 decrypts correctly
    const decryptedV2 = decryptField(migration.value, { keyRing: customKeyRing });
    assert.equal(decryptedV2, originalText);

    // Idempotency: re-encrypting an already v2 record does not re-modify
    const secondPass = reencryptField(migration.value, 'v2', { keyRing: customKeyRing });
    assert.equal(secondPass.modified, false);
    assert.equal(secondPass.value, migration.value);
  });

  it('10. Missing key in KeyRing throws actionable error without data loss', () => {
    const v1Record = encryptField('Confidential', { version: 'v1', key: KEY_V1 });
    // Attempt decrypt with only v2 in ring
    const missingV1Ring = { v2: KEY_V2 };

    assert.throws(
      () => decryptField(v1Record, { keyRing: missingV1Ring }),
      /Key for version 'v1' is not available in KeyRing/i
    );
  });

  it('11. Rejects insecure, weak, or placeholder master keys', () => {
    assert.throws(
      () => normalizeEncryptionKey('your-32-byte-hex-encryption-key-generate-via-crypto-randomBytes'),
      /Insecure template placeholder key detected/i
    );
    assert.throws(
      () => normalizeEncryptionKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
      /Insecure template placeholder key detected/i
    );
    assert.throws(
      () => normalizeEncryptionKey('tooshort'),
      /must be a 64-character hexadecimal string/i
    );
  });
});
