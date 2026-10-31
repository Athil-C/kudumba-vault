import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

import {
  listUserDocuments,
  uploadAndCreateDocument,
  getDocumentById,
  generateDocumentDownloadUrl,
  updateDocumentMetadata,
  deleteDocument,
  getExpiringDocuments,
  clearMockDocStore,
} from './documentService';
import {
  NotificationTracker,
} from './notificationTracker';
import {
  runDocumentExpiryJob,
} from './expiryDetector';
import { VaultDocumentItem, HouseholdMemberItem } from '../types/vault';

describe('Phase 4: Document CRUD APIs & Scheduler Integration', () => {
  const userA = 'usr-alice-101';
  const userB = 'usr-bob-202';
  const adminUser = 'usr-admin-999';

  // Valid 100-byte PDF buffer with authentic %PDF- header
  const samplePdfBuffer = Buffer.concat([
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
    Buffer.alloc(92, 0x20),
  ]);

  describe('Document Creation & Upload Validation', () => {
    it('uploads valid PDF document and stores metadata correctly', async () => {
      clearMockDocStore();

      const doc = await uploadAndCreateDocument(
        userA,
        {
          originalname: 'passport_scan.pdf',
          mimetype: 'application/pdf',
          buffer: samplePdfBuffer,
          size: samplePdfBuffer.length,
        },
        {
          title: 'Indian Passport - Alice',
          category: 'IDENTITY',
          docNumber: 'Z1234567',
          expiryDate: '2028-06-30',
          issuedAt: '2018-07-01',
          notes: 'Primary international passport',
        }
      );

      assert.ok(doc.id, 'Document ID must be generated');
      assert.strictEqual(doc.ownerId, userA);
      assert.strictEqual(doc.title, 'Indian Passport - Alice');
      assert.strictEqual(doc.category, 'IDENTITY');
      assert.strictEqual(doc.mimeType, 'application/pdf');
      assert.ok(doc.storagePath.startsWith(`users/${userA}/`), 'Must be stored under user namespace');
      assert.ok(!doc.storagePath.includes('http://'), 'Storage path must be private key');
    });

    it('rejects disguised executable disguised as PDF (Signature Security)', async () => {
      // Windows PE executable header: MZ (0x4D 0x5A)
      const disguisedExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

      await assert.rejects(
        async () => {
          await uploadAndCreateDocument(
            userA,
            {
              originalname: 'fake_document.pdf',
              mimetype: 'application/pdf',
              buffer: disguisedExe,
              size: disguisedExe.length,
            },
            {
              title: 'Malicious PDF',
              category: 'IDENTITY',
            }
          );
        },
        {
          name: 'Error',
          message: /magic-bytes do not match|Disallowed or forged file signature/,
        }
      );
    });

    it('rejects invalid document category', async () => {
      await assert.rejects(
        async () => {
          await uploadAndCreateDocument(
            userA,
            {
              originalname: 'doc.pdf',
              mimetype: 'application/pdf',
              buffer: samplePdfBuffer,
              size: samplePdfBuffer.length,
            },
            {
              title: 'Invalid Category Doc',
              category: 'NOT_A_REAL_CATEGORY',
            }
          );
        },
        {
          name: 'Error',
          message: /Invalid category/,
        }
      );
    });

    it('rejects invalid expiry date format', async () => {
      await assert.rejects(
        async () => {
          await uploadAndCreateDocument(
            userA,
            {
              originalname: 'doc.pdf',
              mimetype: 'application/pdf',
              buffer: samplePdfBuffer,
              size: samplePdfBuffer.length,
            },
            {
              title: 'Bad Date Doc',
              category: 'IDENTITY',
              expiryDate: 'invalid-date-string',
            }
          );
        },
        {
          name: 'Error',
          message: /Invalid expiryDate format/,
        }
      );
    });
  });

  describe('Document Access & IDOR Prevention', () => {
    let docIdA: string;

    it('creates test document for User A', async () => {
      clearMockDocStore();
      const doc = await uploadAndCreateDocument(
        userA,
        {
          originalname: 'driving_license.pdf',
          mimetype: 'application/pdf',
          buffer: samplePdfBuffer,
          size: samplePdfBuffer.length,
        },
        {
          title: 'Kerala Driving License',
          category: 'VEHICLE',
          expiryDate: '2026-12-31',
        }
      );
      docIdA = doc.id;
      assert.ok(docIdA);
    });

    it('allows User A to view their own document', async () => {
      const doc = await getDocumentById(docIdA, userA, 'USER');
      assert.ok(doc);
      assert.strictEqual(doc.id, docIdA);
      assert.strictEqual(doc.ownerId, userA);
    });

    it('strictly forbids User B from viewing User A document (IDOR Check)', async () => {
      await assert.rejects(
        async () => {
          await getDocumentById(docIdA, userB, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden: You do not have permission to access this document/,
        }
      );
    });

    it('allows User A to generate signed download URL for their own document', async () => {
      const res = await generateDocumentDownloadUrl(docIdA, userA, 'USER');
      assert.ok(res.downloadUrl);
      assert.strictEqual(res.expiresIn, 900);
      assert.strictEqual(res.fileName, 'driving_license.pdf');
    });

    it('strictly forbids User B from downloading User A document', async () => {
      await assert.rejects(
        async () => {
          await generateDocumentDownloadUrl(docIdA, userB, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden/,
        }
      );
    });

    it('allows system ADMIN to access User A document', async () => {
      const doc = await getDocumentById(docIdA, adminUser, 'ADMIN');
      assert.ok(doc);
      assert.strictEqual(doc.id, docIdA);
    });

    it('rejects invalid document ID format', async () => {
      await assert.rejects(
        async () => {
          await getDocumentById('invalid_id_not_objectid', userA, 'USER');
        },
        {
          name: 'Error',
          message: /Invalid document ID format/,
        }
      );
    });
  });

  describe('Document Updates & Deletions', () => {
    let docId: string;

    it('creates document and allows owner to update allowed metadata', async () => {
      clearMockDocStore();
      const doc = await uploadAndCreateDocument(
        userA,
        {
          originalname: 'health_card.pdf',
          mimetype: 'application/pdf',
          buffer: samplePdfBuffer,
          size: samplePdfBuffer.length,
        },
        {
          title: 'Old Health Card Title',
          category: 'HEALTH',
          expiryDate: '2025-01-01',
        }
      );
      docId = doc.id;

      const updated = await updateDocumentMetadata(
        docId,
        userA,
        {
          title: 'Updated Family Health Insurance',
          category: 'INSURANCE',
          expiryDate: '2026-06-01',
          notes: 'Renewed via United India Insurance',
        },
        'USER'
      );

      assert.strictEqual(updated.title, 'Updated Family Health Insurance');
      assert.strictEqual(updated.category, 'INSURANCE');
      assert.strictEqual(updated.notes, 'Renewed via United India Insurance');
    });

    it('forbids User B from updating User A document', async () => {
      await assert.rejects(
        async () => {
          await updateDocumentMetadata(
            docId,
            userB,
            { title: 'Hacked Title' },
            'USER'
          );
        },
        {
          name: 'Error',
          message: /Forbidden/,
        }
      );
    });

    it('forbids User B from deleting User A document', async () => {
      await assert.rejects(
        async () => {
          await deleteDocument(docId, userB, 'USER');
        },
        {
          name: 'Error',
          message: /Forbidden/,
        }
      );
    });

    it('allows owner User A to safely delete document', async () => {
      const result = await deleteDocument(docId, userA, 'USER');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.storageDeleted, true);

      // Verify document is no longer listed in active documents
      const activeList = await listUserDocuments(userA);
      assert.strictEqual(activeList.length, 0);
    });
  });

  describe('Filtering & Expiry Queries', () => {
    it('filters user documents by category and expiry status', async () => {
      clearMockDocStore();

      // Expired document
      await uploadAndCreateDocument(
        userA,
        { originalname: 'expired.pdf', mimetype: 'application/pdf', buffer: samplePdfBuffer, size: samplePdfBuffer.length },
        { title: 'Old Car Insurance', category: 'VEHICLE', expiryDate: '2020-01-01' }
      );

      // Due soon document (10 days from now)
      const dueSoonDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await uploadAndCreateDocument(
        userA,
        { originalname: 'soon.pdf', mimetype: 'application/pdf', buffer: samplePdfBuffer, size: samplePdfBuffer.length },
        { title: 'Expiring Passport', category: 'IDENTITY', expiryDate: dueSoonDate }
      );

      // Valid document (2 years from now)
      const validDate = new Date(Date.now() + 700 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await uploadAndCreateDocument(
        userA,
        { originalname: 'valid.pdf', mimetype: 'application/pdf', buffer: samplePdfBuffer, size: samplePdfBuffer.length },
        { title: 'New House Deed', category: 'PROPERTY', expiryDate: validDate }
      );

      // Filter by category
      const identityDocs = await listUserDocuments(userA, { category: 'IDENTITY' });
      assert.strictEqual(identityDocs.length, 1);
      assert.strictEqual(identityDocs[0].title, 'Expiring Passport');

      // Filter by status: EXPIRED
      const expiredDocs = await listUserDocuments(userA, { status: 'EXPIRED' });
      assert.strictEqual(expiredDocs.length, 1);
      assert.strictEqual(expiredDocs[0].title, 'Old Car Insurance');

      // Filter by status: DUE_SOON
      const dueSoonDocs = await listUserDocuments(userA, { status: 'DUE_SOON' });
      assert.strictEqual(dueSoonDocs.length, 1);
      assert.strictEqual(dueSoonDocs[0].title, 'Expiring Passport');

      // Query expiring documents within 60 days
      const expiring = await getExpiringDocuments(userA, 60);
      assert.strictEqual(expiring.length, 2); // expired + due soon
    });
  });

  describe('Scheduler Atomic Claim & Deduplication Under Concurrency', () => {
    it('prevents duplicate notification sends under simulated concurrent worker claims', async () => {
      const tracker = new NotificationTracker();
      tracker.clear();

      const docId = 'doc-concurrent-test-1';
      const targetEmail = 'resident@kudumba.in';
      const milestone = 30;
      const expiryDate = '2026-05-15';

      // Worker 1 claims
      const claim1 = tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate);
      assert.strictEqual(claim1, true, 'Worker 1 must claim successfully');

      // Worker 2 attempts concurrent claim on the same notification
      const claim2 = tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate);
      assert.strictEqual(claim2, false, 'Worker 2 claim must be rejected as duplicate');

      // Mark sent by worker 1
      tracker.markSent(docId, targetEmail, milestone, expiryDate, 'msg-smtp-id-12345');

      // Worker 3 attempts claim after it has been sent
      const claim3 = tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate);
      assert.strictEqual(claim3, false, 'Claim after sent must be rejected');
    });

    it('supports renewal rollover when document expiry date changes', async () => {
      const tracker = new NotificationTracker();
      tracker.clear();

      const docId = 'doc-renewal-test-2';
      const targetEmail = 'resident@kudumba.in';
      const milestone = 30;
      const oldExpiryDate = '2025-05-01';
      const newRenewedExpiryDate = '2026-05-01';

      // 1. Claim and send notification for old expiry date
      const claimOld = tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, oldExpiryDate);
      assert.strictEqual(claimOld, true);
      tracker.markSent(docId, targetEmail, milestone, oldExpiryDate, 'msg-old');

      // 2. Document is renewed: user updates expiry date to new date
      // Claim for the same document and milestone, but for the renewed expiry date
      const claimRenewed = tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, newRenewedExpiryDate);
      assert.strictEqual(claimRenewed, true, 'Renewal with new expiry date must permit fresh milestone dispatch');
    });

    it('enforces bounded retry policy: rejects claims after 3 failed attempts', () => {
      const tracker = new NotificationTracker();
      tracker.clear();

      const docId = 'doc-failure-retry-test';
      const targetEmail = 'resident@kudumba.in';
      const milestone = 7;
      const expiryDate = '2026-05-01';

      // Attempt 1 fails
      assert.strictEqual(tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate), true);
      tracker.markFailed(docId, targetEmail, milestone, expiryDate, 'SMTP Timeout');

      // Attempt 2 fails
      assert.strictEqual(tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate), true);
      tracker.markFailed(docId, targetEmail, milestone, expiryDate, 'Connection refused');

      // Attempt 3 fails
      assert.strictEqual(tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate), true);
      tracker.markFailed(docId, targetEmail, milestone, expiryDate, 'Auth failed');

      // Attempt 4 should be rejected by bounded retry policy
      const attempt4 = tracker.claimForDispatch(docId, 'mem-1', targetEmail, milestone, expiryDate);
      assert.strictEqual(attempt4, false, 'Attempt 4 must be blocked after 3 failures');
    });
  });
});
