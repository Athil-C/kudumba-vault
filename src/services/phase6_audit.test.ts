import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

import { connectDatabase } from '../config/db';
import {
  uploadDocumentToStorage,
  createDocumentSignedUrl,
  verifyFileSignature,
  validateDocumentFile,
} from './supabaseStorage';
import {
  registerUser,
  loginUser,
  generateAuthToken,
  verifyAuthToken,
  clearMockUserStore,
} from './authService';
import {
  uploadAndCreateDocument,
  getDocumentById,
  generateDocumentDownloadUrl,
  updateDocumentMetadata,
  deleteDocument,
  listUserDocuments,
  clearMockDocStore,
} from './documentService';
import { createRateLimiter } from '../middleware/rateLimiter';
import { NotificationTracker } from './notificationTracker';

describe('Phase 6: Live Verification, Security Audit & Deployment Readiness', () => {
  const samplePdf = Buffer.concat([
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
    Buffer.alloc(100, 0x20),
  ]);

  describe('1. Production Guardrails & Mock Isolation Audit', () => {
    it('aborts startup in production if MONGODB_URI is missing, even if ALLOW_MOCK_DB=true is set', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevUri = process.env.MONGODB_URI;
      const prevAllowMock = process.env.ALLOW_MOCK_DB;

      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_MOCK_DB = 'true';
        delete process.env.MONGODB_URI;

        await assert.rejects(
          async () => {
            await connectDatabase();
          },
          {
            name: 'Error',
            message: /Production startup aborted: MONGODB_URI is required/,
          }
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
        if (prevAllowMock !== undefined) process.env.ALLOW_MOCK_DB = prevAllowMock;
      }
    });

    it('rejects mock storage fallback in production if Supabase credentials are missing', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevMock = process.env.ALLOW_MOCK_STORAGE;
      const prevUrl = process.env.SUPABASE_URL;
      const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_MOCK_STORAGE = 'true';
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Attempting to upload without live client in production must abort and throw
        await assert.rejects(
          async () => {
            await uploadDocumentToStorage('users/test/doc.pdf', samplePdf, 'application/pdf');
          },
          {
            name: 'Error',
            message: /Production startup aborted: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured/,
          }
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevMock !== undefined) process.env.ALLOW_MOCK_STORAGE = prevMock;
        if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
        if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      }
    });
  });

  describe('2. Authentication Security & Enumeration Defense', () => {
    const testEmail = `audit_user_${Date.now()}@kudumba.in`;
    const testPassword = 'StrongPassword_2026!';

    it('registers user, hashes password with bcrypt, and hides password hash from output', async () => {
      clearMockUserStore();
      const res = await registerUser({
        name: 'Audit Household',
        email: testEmail,
        password: testPassword,
        preferredLang: 'ml',
      });

      assert.strictEqual(res.user.email, testEmail.toLowerCase());
      assert.strictEqual((res.user as any).passwordHash, undefined, 'passwordHash must never be exposed');
      assert.ok(res.token, 'JWT token must be generated');
    });

    it('prevents account enumeration by returning identical generic error for invalid email and invalid password', async () => {
      // 1. Non-existent email
      await assert.rejects(
        async () => {
          await loginUser({
            email: 'nonexistent_account_audit@kudumba.in',
            password: 'AnyPassword123!',
          });
        },
        {
          name: 'Error',
          message: 'Invalid email or password.',
        }
      );

      // 2. Existing email with wrong password
      await assert.rejects(
        async () => {
          await loginUser({
            email: testEmail,
            password: 'CompletelyWrongPassword!',
          });
        },
        {
          name: 'Error',
          message: 'Invalid email or password.',
        }
      );
    });

    it('rate limiter enforces max attempts and sets Retry-After header', () => {
      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Rate limit exceeded.',
      });

      const ip = '198.51.100.42';
      const req: any = { headers: {}, socket: { remoteAddress: ip } };
      let statusCode = 0;
      let retryAfterHeader = '';
      const res: any = {
        setHeader(name: string, val: string) {
          if (name === 'Retry-After') retryAfterHeader = val;
        },
        status(c: number) {
          statusCode = c;
          return this;
        },
        json(_b: any) {},
      };

      let passed = 0;
      const next = () => {
        passed++;
      };

      // 3 attempts pass
      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next);
      assert.strictEqual(passed, 3);

      // 4th attempt is rate-limited (HTTP 429)
      limiter(req, res, next);
      assert.strictEqual(statusCode, 429);
      assert.ok(parseInt(retryAfterHeader, 10) > 0);
    });

    it('rejects tampered and forged JWT tokens', () => {
      const token = generateAuthToken({ id: 'usr-audit', email: 'audit@kudumba.in', role: 'USER' });
      const tampered = token.slice(0, -5) + 'zzzzz';

      assert.throws(
        () => {
          verifyAuthToken(tampered);
        },
        {
          name: 'Error',
          message: /Invalid or malformed authentication token/,
        }
      );
    });
  });

  describe('3. Insecure Direct Object Reference (IDOR) & Cross-User Isolation', () => {
    const userVictim = 'usr-victim-777';
    const userAttacker = 'usr-attacker-888';
    let victimDocId: string;

    it('creates document owned exclusively by Victim User', async () => {
      clearMockDocStore();
      const doc = await uploadAndCreateDocument(
        userVictim,
        {
          originalname: 'property_deed.pdf',
          mimetype: 'application/pdf',
          buffer: samplePdf,
          size: samplePdf.length,
        },
        {
          title: 'Family Land Deed',
          category: 'PROPERTY',
          docNumber: 'DOC-KL-987654',
          expiryDate: '2030-01-01',
        }
      );
      victimDocId = doc.id;
      assert.ok(victimDocId);
    });

    it('strictly denies Attacker User from reading Victim document (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await getDocumentById(victimDocId, userAttacker, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden: You do not have permission to access this document/,
        }
      );
    });

    it('strictly denies Attacker User from generating download URL for Victim document (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await generateDocumentDownloadUrl(victimDocId, userAttacker, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden/,
        }
      );
    });

    it('strictly denies Attacker User from modifying Victim document metadata (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await updateDocumentMetadata(victimDocId, userAttacker, { title: 'Attacked Document' }, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden/,
        }
      );
    });

    it('strictly denies Attacker User from deleting Victim document (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await deleteDocument(victimDocId, userAttacker, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden/,
        }
      );
    });
  });

  describe('4. File Integrity & Signature Spoofing Defense', () => {
    it('rejects disguised executable files with .pdf extension', () => {
      const disguisedExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ header
      const check = validateDocumentFile({
        originalname: 'tax_return.pdf',
        mimetype: 'application/pdf',
        buffer: disguisedExe,
      });

      assert.strictEqual(check.valid, false);
      assert.ok(check.error?.includes('magic-bytes do not match') || check.error?.includes('Disallowed'));
    });

    it('rejects files exceeding 25 MB size threshold', () => {
      const hugeBuffer = Buffer.alloc(10);
      const check = validateDocumentFile({
        originalname: 'huge_scan.pdf',
        mimetype: 'application/pdf',
        buffer: hugeBuffer,
        size: 26 * 1024 * 1024, // 26 MB
      });

      assert.strictEqual(check.valid, false);
      assert.ok(check.error?.includes('exceeds the 25 MB limit'));
    });

    it('sanitizes directory traversal characters from uploaded filenames', () => {
      const check = validateDocumentFile({
        originalname: '../../../etc/passwd.pdf',
        mimetype: 'application/pdf',
        buffer: samplePdf,
      });

      assert.strictEqual(check.valid, true);
      assert.strictEqual(check.sanitizedFileName.includes('..'), false);
      assert.strictEqual(check.sanitizedFileName.includes('/'), false);
      assert.strictEqual(check.sanitizedFileName.includes('\\'), false);
    });
  });

  describe('5. Notification Deduplication & Expiry Rollover Audit', () => {
    it('guarantees atomic locking and single send under concurrent worker claims', () => {
      const tracker = new NotificationTracker();
      tracker.clear();

      const docId = 'doc-audit-concurrency';
      const email = 'audit_family@kudumba.in';
      const milestone = 60;
      const expiry = '2026-08-30';

      // Worker 1 claims
      const w1 = tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry);
      assert.strictEqual(w1, true);

      // Concurrent Worker 2 tries same milestone
      const w2 = tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry);
      assert.strictEqual(w2, false);

      // Worker 1 marks sent
      tracker.markSent(docId, email, milestone, expiry, 'smtp-id-9988');

      // Subsequent attempt blocked
      const w3 = tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry);
      assert.strictEqual(w3, false);
    });

    it('resets notification lifecycle when document is renewed with new expiry date', () => {
      const tracker = new NotificationTracker();
      tracker.clear();

      const docId = 'doc-renewal-audit';
      const email = 'audit_family@kudumba.in';
      const milestone = 30;

      // Old year 2025 notification sent
      tracker.claimForDispatch(docId, 'mem-1', email, milestone, '2025-06-15');
      tracker.markSent(docId, email, milestone, '2025-06-15', 'smtp-old');

      // Renewed to 2026: fresh milestone permitted
      const renewedClaim = tracker.claimForDispatch(docId, 'mem-1', email, milestone, '2026-06-15');
      assert.strictEqual(renewedClaim, true);
    });

    it('bounds retries and halts dispatches after 3 failed attempts', () => {
      const tracker = new NotificationTracker();
      tracker.clear();

      const docId = 'doc-retry-audit';
      const email = 'audit_family@kudumba.in';
      const milestone = 1;
      const expiry = '2026-04-10';

      // 3 failures
      for (let i = 1; i <= 3; i++) {
        assert.strictEqual(tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry), true);
        tracker.markFailed(docId, email, milestone, expiry, `Failure #${i}`);
      }

      // 4th attempt rejected
      assert.strictEqual(tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry), false);
    });
  });

  describe('6. End-to-End Document Lifecycle & Deletion Verification', () => {
    it('executes complete CRUD cycle: create, read, update, download, delete', async () => {
      clearMockDocStore();
      const userId = 'usr-e2e-tester';

      // 1. Upload document
      const doc = await uploadAndCreateDocument(
        userId,
        {
          originalname: 'voter_id.pdf',
          mimetype: 'application/pdf',
          buffer: samplePdf,
          size: samplePdf.length,
        },
        {
          title: 'Kerala Voter ID',
          category: 'IDENTITY',
          docNumber: 'KL/07/045/123456',
          expiryDate: '2029-10-15',
        }
      );
      assert.ok(doc.id);

      // 2. Read single document
      const readDoc = await getDocumentById(doc.id, userId, 'USER');
      assert.strictEqual(readDoc.title, 'Kerala Voter ID');

      // 3. Update metadata
      const updated = await updateDocumentMetadata(
        doc.id,
        userId,
        { title: 'Kerala Voter Identity Card (Election Commission)' },
        'USER'
      );
      assert.strictEqual(updated.title, 'Kerala Voter Identity Card (Election Commission)');

      // 4. Download signed URL
      const dl = await generateDocumentDownloadUrl(doc.id, userId, 'USER');
      assert.ok(dl.downloadUrl);
      assert.strictEqual(dl.expiresIn, 900);

      // 5. Delete document
      const del = await deleteDocument(doc.id, userId, 'USER');
      assert.strictEqual(del.success, true);
      assert.strictEqual(del.storageDeleted, true);

      // 6. Verify list shows 0 active documents
      const docs = await listUserDocuments(userId);
      assert.strictEqual(docs.length, 0);
    });
  });
});
