import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  User,
  hashUserPassword,
  isDuplicateEmailError,
} from './User';
import {
  DocumentModel,
  ALLOWED_DOC_CATEGORIES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from './Document';
import {
  NotificationLog,
  sanitizeNotificationError,
  isDuplicateNotificationError,
} from './NotificationLog';

async function getValidationError(modelInstance: mongoose.Document): Promise<mongoose.Error.ValidationError | null> {
  try {
    await modelInstance.validate();
    return null;
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      return err;
    }
    throw err;
  }
}

describe('Phase 2: Mongoose Schemas & Model Design', () => {
  describe('User Model Schema & Security', () => {
    it('validates required fields: name, email, and passwordHash', async () => {
      const user = new User({});
      const err = await getValidationError(user);
      assert.ok(err, 'Expected validation error for missing fields');
      assert.ok(err.errors.name, 'Expected error for missing name');
      assert.ok(err.errors.email, 'Expected error for missing email');
      assert.ok(err.errors.passwordHash, 'Expected error for missing passwordHash');
    });

    it('normalizes email to lowercase and trims whitespace', () => {
      const user = new User({
        name: 'Sreedevi Menon',
        email: '  Sreedevi.Menon@Gmail.COM  ',
        passwordHash: 'dummy-hashed-pass-12345678',
      });
      assert.strictEqual(user.email, 'sreedevi.menon@gmail.com');
    });

    it('rejects invalid email formats', async () => {
      const user = new User({
        name: 'Invalid Email User',
        email: 'not-an-email-address',
        passwordHash: 'dummy-hash',
      });
      const err = await getValidationError(user);
      assert.ok(err?.errors.email, 'Expected error for invalid email regex');
    });

    it('rejects disallowed role values', async () => {
      const user = new User({
        name: 'Hacker Role',
        email: 'test@kudumba.in',
        passwordHash: 'valid-hash-12345678',
        role: 'SUPERUSER' as any,
      });
      const err = await getValidationError(user);
      assert.ok(err?.errors.role, 'Expected error for unpermitted role enum');
    });

    it('hashes passwords securely and compares candidate passwords', async () => {
      const rawPassword = 'SecretVaultPassword!2026';
      const hash = await hashUserPassword(rawPassword);
      assert.notStrictEqual(hash, rawPassword);
      assert.ok(hash.startsWith('$2'), 'Bcrypt hash should start with $2');

      const user = new User({
        name: 'Athil C',
        email: 'athil@kudumba.in',
        passwordHash: hash,
      });

      const match = await user.comparePassword(rawPassword);
      assert.strictEqual(match, true);

      const wrong = await user.comparePassword('WrongPassword123');
      assert.strictEqual(wrong, false);
    });

    it('strictly excludes passwordHash and __v from serialized JSON output', () => {
      const user = new User({
        name: 'Privacy Check',
        email: 'privacy@kudumba.in',
        passwordHash: '$2a$12$SuperSecretHashedStringThatShouldNeverBeLeaked',
      });

      const jsonStr = JSON.stringify(user);
      const parsed = JSON.parse(jsonStr);

      assert.strictEqual(parsed.passwordHash, undefined);
      assert.strictEqual(parsed.__v, undefined);
      assert.strictEqual(parsed.name, 'Privacy Check');
      assert.strictEqual(parsed.email, 'privacy@kudumba.in');

      // Also verify toSafeObject()
      const safe = user.toSafeObject();
      assert.strictEqual((safe as any).passwordHash, undefined);
      assert.strictEqual((safe as any).__v, undefined);
    });

    it('detects duplicate email error code 11000 safely', () => {
      const mongoDupError = {
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: 'duplicate@kudumba.in' },
      };
      assert.strictEqual(isDuplicateEmailError(mongoDupError), true);
      assert.strictEqual(isDuplicateEmailError({ code: 11000, keyPattern: { other: 1 } }), false);
      assert.strictEqual(isDuplicateEmailError(new Error('Generic failure')), false);
    });
  });

  describe('Document Model Schema & Security', () => {
    const validOwnerId = new mongoose.Types.ObjectId();

    it('validates required fields: ownerId, title, category, fileName, storagePath, mimeType, fileSize', async () => {
      const doc = new DocumentModel({});
      const err = await getValidationError(doc);
      assert.ok(err, 'Expected validation error for missing document fields');
      assert.ok(err.errors.ownerId, 'Missing ownerId');
      assert.ok(err.errors.title, 'Missing title');
      assert.ok(err.errors.category, 'Missing category');
      assert.ok(err.errors.fileName, 'Missing fileName');
      assert.ok(err.errors.storagePath, 'Missing storagePath');
      assert.ok(err.errors.mimeType, 'Missing mimeType');
      assert.ok(err.errors.fileSize, 'Missing fileSize');
    });

    it('permits all designated Kudumba Vault document categories', async () => {
      for (const cat of ALLOWED_DOC_CATEGORIES) {
        const doc = new DocumentModel({
          ownerId: validOwnerId,
          title: `Test ${cat}`,
          category: cat,
          fileName: 'test.pdf',
          storagePath: `vault/${validOwnerId}/test.pdf`,
          mimeType: 'application/pdf',
          fileSize: 1024,
        });
        const err = await getValidationError(doc);
        assert.strictEqual(err, null, `Category ${cat} should be valid`);
      }
    });

    it('rejects unpermitted document categories', async () => {
      const doc = new DocumentModel({
        ownerId: validOwnerId,
        title: 'Bad Category',
        category: 'ILLEGAL_CAT' as any,
        fileName: 'test.pdf',
        storagePath: `vault/${validOwnerId}/test.pdf`,
        mimeType: 'application/pdf',
        fileSize: 1024,
      });
      const err = await getValidationError(doc);
      assert.ok(err?.errors.category, 'Expected error for unpermitted category');
    });

    it('strictly rejects public URLs or data URIs in storagePath (Private Storage Protection)', async () => {
      const publicUrls = [
        'http://example.com/uploads/doc.pdf',
        'https://supabase.co/storage/v1/object/public/vault/doc.pdf',
        'data:application/pdf;base64,JVBERi0xLjQK...',
      ];

      for (const badPath of publicUrls) {
        const doc = new DocumentModel({
          ownerId: validOwnerId,
          title: 'Public Leak Test',
          category: 'IDENTITY',
          fileName: 'doc.pdf',
          storagePath: badPath,
          mimeType: 'application/pdf',
          fileSize: 1024,
        });
        const err = await getValidationError(doc);
        assert.ok(err?.errors.storagePath, `Should reject public/data storagePath: ${badPath}`);
      }
    });

    it('strictly rejects directory traversal in fileName', async () => {
      const badFileNames = [
        '../../etc/passwd',
        '..\\windows\\system32',
        'sub/folder/file.pdf',
      ];

      for (const badName of badFileNames) {
        const doc = new DocumentModel({
          ownerId: validOwnerId,
          title: 'Traversal Test',
          category: 'IDENTITY',
          fileName: badName,
          storagePath: `vault/${validOwnerId}/safe-key.pdf`,
          mimeType: 'application/pdf',
          fileSize: 1024,
        });
        const err = await getValidationError(doc);
        assert.ok(err?.errors.fileName, `Should reject directory traversal in: ${badName}`);
      }
    });

    it('validates allowed MIME types and rejects dangerous formats', async () => {
      for (const mime of ALLOWED_MIME_TYPES) {
        const doc = new DocumentModel({
          ownerId: validOwnerId,
          title: `MIME ${mime}`,
          category: 'IDENTITY',
          fileName: 'doc.pdf',
          storagePath: `vault/${validOwnerId}/key.pdf`,
          mimeType: mime,
          fileSize: 1024,
        });
        assert.strictEqual(await getValidationError(doc), null);
      }

      // Reject executables and scripts
      const badMimes = ['application/x-msdownload', 'text/html', 'application/javascript'];
      for (const badMime of badMimes) {
        const doc = new DocumentModel({
          ownerId: validOwnerId,
          title: 'Dangerous MIME',
          category: 'IDENTITY',
          fileName: 'danger.exe',
          storagePath: `vault/${validOwnerId}/danger.exe`,
          mimeType: badMime as any,
          fileSize: 1024,
        });
        const err = await getValidationError(doc);
        assert.ok(err?.errors.mimeType, `Should reject MIME: ${badMime}`);
      }
    });

    it('enforces positive file size and bounds under 25 MB limit', async () => {
      const zeroSizeDoc = new DocumentModel({
        ownerId: validOwnerId,
        title: 'Zero Size',
        category: 'IDENTITY',
        fileName: 'empty.pdf',
        storagePath: `vault/${validOwnerId}/empty.pdf`,
        mimeType: 'application/pdf',
        fileSize: 0,
      });
      const zeroErr = await getValidationError(zeroSizeDoc);
      assert.ok(zeroErr?.errors.fileSize, 'Should reject 0 byte file');

      const oversizedDoc = new DocumentModel({
        ownerId: validOwnerId,
        title: 'Oversized',
        category: 'IDENTITY',
        fileName: 'huge.pdf',
        storagePath: `vault/${validOwnerId}/huge.pdf`,
        mimeType: 'application/pdf',
        fileSize: MAX_FILE_SIZE_BYTES + 1,
      });
      const overErr = await getValidationError(oversizedDoc);
      assert.ok(overErr?.errors.fileSize, 'Should reject > 25MB file');
    });

    it('masks Aadhaar and sensitive document numbers in serialized output', () => {
      const doc = new DocumentModel({
        ownerId: validOwnerId,
        title: 'Mother Aadhaar Card',
        category: 'IDENTITY',
        fileName: 'aadhaar.pdf',
        storagePath: `vault/${validOwnerId}/aadhaar.pdf`,
        mimeType: 'application/pdf',
        fileSize: 50000,
        docNumber: '5421 8920 4821',
      });

      const serialized = JSON.parse(JSON.stringify(doc));
      // First 8 digits masked with dots, only last 4 visible: '•••• •••• 4821'
      assert.strictEqual(serialized.maskedNumber, '•••• •••• 4821');
    });

    it('verifies compound indexes are configured on DocumentSchema', () => {
      const indexes = DocumentModel.schema.indexes();
      const indexKeys = indexes.map(([spec]) => Object.keys(spec).join('_'));

      assert.ok(indexKeys.includes('ownerId_expiryDate'), 'Should have index { ownerId: 1, expiryDate: 1 }');
      assert.ok(indexKeys.includes('ownerId_category'), 'Should have index { ownerId: 1, category: 1 }');
      assert.ok(indexKeys.includes('ownerId_deletedAt'), 'Should have index { ownerId: 1, deletedAt: 1 }');
    });
  });

  describe('NotificationLog Model Schema & Idempotency', () => {
    const validOwnerId = new mongoose.Types.ObjectId();
    const validDocId = new mongoose.Types.ObjectId();

    it('validates required fields: ownerId, documentId, milestone, expiryDate, recipientEmail', async () => {
      const log = new NotificationLog({});
      const err = await getValidationError(log);
      assert.ok(err, 'Expected validation error');
      assert.ok(err.errors.ownerId, 'Missing ownerId');
      assert.ok(err.errors.documentId, 'Missing documentId');
      assert.ok(err.errors.milestone, 'Missing milestone');
      assert.ok(err.errors.expiryDate, 'Missing expiryDate');
      assert.ok(err.errors.recipientEmail, 'Missing recipientEmail');
    });

    it('accepts standard milestones: 60, 30, 7, 1, 0, and weekly overdue (-7, -14)', async () => {
      const testMilestones = [60, 30, 7, 1, 0, -7, -14, -21];
      for (const m of testMilestones) {
        const log = new NotificationLog({
          ownerId: validOwnerId,
          documentId: validDocId,
          milestone: m,
          expiryDate: '2026-05-15',
          recipientEmail: 'resident@kudumba.in',
        });
        const err = await getValidationError(log);
        assert.strictEqual(err, null, `Milestone ${m} should be valid`);
      }
    });

    it('enforces YYYY-MM-DD date format for expiryDate milestone anchoring', async () => {
      const badLog = new NotificationLog({
        ownerId: validOwnerId,
        documentId: validDocId,
        milestone: 30,
        expiryDate: '15/05/2026', // Bad format
        recipientEmail: 'resident@kudumba.in',
      });
      const err = await getValidationError(badLog);
      assert.ok(err?.errors.expiryDate, 'Should reject non-ISO YYYY-MM-DD date');
    });

    it('verifies unique compound idempotency index on schema', () => {
      const indexes = NotificationLog.schema.indexes();
      const uniqueCompound = indexes.find(([spec, options]) => {
        const keys = Object.keys(spec);
        return (
          keys.includes('documentId') &&
          keys.includes('ownerId') &&
          keys.includes('milestone') &&
          keys.includes('expiryDate') &&
          options?.unique === true
        );
      });

      assert.ok(uniqueCompound, 'Unique compound index { documentId, ownerId, milestone, expiryDate } must exist');
    });

    it('handles document expiry-date changes safely (renewal idempotency rollover)', () => {
      // Original document expiring in 2025
      const oldExpiryDate = '2025-05-01';
      const renewedExpiryDate = '2026-05-01';

      const oldRecord = new NotificationLog({
        ownerId: validOwnerId,
        documentId: validDocId,
        milestone: 30,
        expiryDate: oldExpiryDate,
        recipientEmail: 'resident@kudumba.in',
        status: 'sent',
      });

      // Renewed document with same documentId & milestone but new expiryDate
      const renewedRecord = new NotificationLog({
        ownerId: validOwnerId,
        documentId: validDocId,
        milestone: 30,
        expiryDate: renewedExpiryDate,
        recipientEmail: 'resident@kudumba.in',
        status: 'pending',
      });

      assert.notStrictEqual(oldRecord.expiryDate, renewedRecord.expiryDate);
      // Because expiryDate is part of the compound unique key, the renewed record has a distinct key
      const oldKey = `${oldRecord.documentId}_${oldRecord.ownerId}_${oldRecord.milestone}_${oldRecord.expiryDate}`;
      const newKey = `${renewedRecord.documentId}_${renewedRecord.ownerId}_${renewedRecord.milestone}_${renewedRecord.expiryDate}`;
      assert.notStrictEqual(oldKey, newKey, 'Compound key must differ when expiry date is renewed');
    });

    it('sanitizes notification errors to strip SMTP passwords and secret tokens', () => {
      const rawError = 'Invalid login: password=MySecretGmailPass123 auth token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz123';
      const sanitized = sanitizeNotificationError(rawError);

      assert.ok(sanitized, 'Sanitized error should exist');
      assert.strictEqual(sanitized.includes('MySecretGmailPass123'), false, 'Should strip plain password');
      assert.strictEqual(sanitized.includes('password=[REDACTED]'), true, 'Should replace with [REDACTED]');
    });

    it('detects duplicate notification error code 11000', () => {
      const mongoDupError = {
        code: 11000,
        keyPattern: { documentId: 1, ownerId: 1, milestone: 1, expiryDate: 1 },
      };
      assert.strictEqual(isDuplicateNotificationError(mongoDupError), true);
      assert.strictEqual(isDuplicateNotificationError(new Error('Network error')), false);
    });
  });
});
