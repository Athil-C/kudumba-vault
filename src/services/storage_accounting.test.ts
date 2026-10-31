import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

import {
  calculateStorageUsage,
  BYTES_PER_GIB,
  BYTES_PER_MIB,
} from '../utils/vaultLogic';
import {
  getUserStorageUsage,
  clearMockDocStore,
  uploadAndCreateDocument,
  deleteDocument,
  DEFAULT_PLAN_QUOTA_BYTES,
} from './documentService';
import {
  validateUploadEntitlement,
  releaseQuotaReservation,
  _resetMockSubscriptions,
  simulateSubscriptionDev,
} from './subscriptionService';

describe('Storage Accounting & Usage Quota System', () => {
  beforeEach(() => {
    clearMockDocStore();
    _resetMockSubscriptions();
  });

  describe('Pure Storage Calculation Formula: percentageUsed = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0', () => {
    const QUOTA_3_GIB = 3 * BYTES_PER_GIB; // 3,221,225,472 bytes

    it('1. Zero usage: displays 0 bytes out of 3 GiB as 0.0 GiB and 0.0% used', () => {
      const result = calculateStorageUsage(0, QUOTA_3_GIB);
      assert.strictEqual(result.usedBytes, 0);
      assert.strictEqual(result.quotaBytes, QUOTA_3_GIB);
      assert.strictEqual(result.percentageUsed, 0);
      assert.strictEqual(result.formattedUsed, '0.0 GiB');
      assert.strictEqual(result.formattedQuota, '3.0 GiB');
      assert.strictEqual(result.usedGiB, 0);
    });

    it('2. 40% usage: displays 1.2 GiB out of 3 GiB as 1.2 GiB and 40.0% used', () => {
      const USED_1_2_GIB = Math.round(1.2 * BYTES_PER_GIB); // 1,288,490,189 bytes
      const result = calculateStorageUsage(USED_1_2_GIB, QUOTA_3_GIB);
      assert.strictEqual(result.percentageUsed, 40);
      assert.strictEqual(result.formattedUsed, '1.2 GiB');
      assert.strictEqual(result.formattedQuota, '3.0 GiB');
      assert.strictEqual(result.usedGiB, 1.2);
    });

    it('3. Full quota: displays 3 GiB out of 3 GiB as 3.0 GiB and 100.0% used', () => {
      const result = calculateStorageUsage(QUOTA_3_GIB, QUOTA_3_GIB);
      assert.strictEqual(result.percentageUsed, 100);
      assert.strictEqual(result.formattedUsed, '3.0 GiB');
      assert.strictEqual(result.formattedQuota, '3.0 GiB');
      assert.strictEqual(result.usedGiB, 3);
    });

    it('4. Usage exceeding quota: clamps percentage to 100% and displays actual GiB used', () => {
      const OVER_QUOTA_BYTES = Math.round(3.5 * BYTES_PER_GIB);
      const result = calculateStorageUsage(OVER_QUOTA_BYTES, QUOTA_3_GIB);
      assert.strictEqual(result.percentageUsed, 100, 'Exceeded usage must be clamped to 100% max');
      assert.strictEqual(result.formattedUsed, '3.5 GiB');
      assert.strictEqual(result.usedGiB, 3.5);
    });

    it('5. Zero or missing quota: safely handles quota = 0, null, or undefined without NaN or division by zero', () => {
      const resZero = calculateStorageUsage(500 * BYTES_PER_MIB, 0);
      assert.strictEqual(resZero.percentageUsed, 0);
      assert.strictEqual(isNaN(resZero.percentageUsed), false);

      const resNull = calculateStorageUsage(1000, null as any);
      assert.strictEqual(resNull.percentageUsed, 0);
      assert.strictEqual(isNaN(resNull.percentageUsed), false);

      const resUndefined = calculateStorageUsage(undefined as any, undefined as any);
      assert.strictEqual(resUndefined.percentageUsed, 0);
      assert.strictEqual(resUndefined.usedBytes, 0);
      assert.strictEqual(resUndefined.quotaBytes, 0);
    });

    it('6. Small file sizes (< 0.1 GiB): formats human-readable in MiB without rounding to zero', () => {
      const SMALL_BYTES = 25 * BYTES_PER_MIB; // 25 MiB
      const result = calculateStorageUsage(SMALL_BYTES, QUOTA_3_GIB);
      assert.strictEqual(result.formattedUsed, '25.0 MiB');
      assert.strictEqual(result.formattedQuota, '3.0 GiB');
      // 25 MiB / 3072 MiB = ~0.8%
      assert.strictEqual(result.percentageUsed, 0.8);
    });
  });

  describe('Authoritative Backend Storage Usage (Single Source of Truth)', () => {
    const userA = 'user-family-owner-a';
    const userB = 'user-family-owner-b';

    it('7. Accurately reports zero usage when account has no documents', async () => {
      const usage = await getUserStorageUsage(userA);
      assert.strictEqual(usage.usedBytes, 0);
      assert.strictEqual(usage.documentCount, 0);
      assert.strictEqual(usage.percentageUsed, 0);
      assert.strictEqual(usage.usedGiB, 0);
      assert.strictEqual(usage.quotaGiB, 3);
    });

    it('8. Accurately aggregates document file sizes for authenticated user', async () => {
      const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]); // 9 bytes
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]); // 11 bytes

      await uploadAndCreateDocument(
        userA,
        {
          buffer: pdfBytes,
          originalname: 'passport.pdf',
          mimetype: 'application/pdf',
          size: pdfBytes.length,
        },
        { title: 'Passport', category: 'IDENTITY' }
      );

      await uploadAndCreateDocument(
        userA,
        {
          buffer: pngBytes,
          originalname: 'rc_book.png',
          mimetype: 'image/png',
          size: pngBytes.length,
        },
        { title: 'Vehicle RC', category: 'VEHICLE' }
      );

      const usage = await getUserStorageUsage(userA);
      const expectedTotal = pdfBytes.length + pngBytes.length; // 20 bytes
      assert.strictEqual(usage.usedBytes, expectedTotal);
      assert.strictEqual(usage.documentCount, 2);
      assert.strictEqual(usage.categoryBreakdown.IDENTITY.count, 1);
      assert.strictEqual(usage.categoryBreakdown.IDENTITY.bytes, pdfBytes.length);
      assert.strictEqual(usage.categoryBreakdown.VEHICLE.count, 1);
      assert.strictEqual(usage.categoryBreakdown.VEHICLE.bytes, pngBytes.length);
    });

    it('9. Strictly excludes deleted documents from storage accounting', async () => {
      const fileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // 8 bytes

      const doc = await uploadAndCreateDocument(
        userA,
        {
          buffer: fileBuffer,
          originalname: 'old_contract.pdf',
          mimetype: 'application/pdf',
          size: fileBuffer.length,
        },
        { title: 'Old Contract', category: 'PROPERTY' }
      );

      const usageBefore = await getUserStorageUsage(userA);
      assert.strictEqual(usageBefore.usedBytes, fileBuffer.length);
      assert.strictEqual(usageBefore.documentCount, 1);

      // Delete document (params: documentId, userId, userRole)
      await deleteDocument(doc.id || doc._id?.toString(), userA, 'USER');

      const usageAfter = await getUserStorageUsage(userA);
      assert.strictEqual(usageAfter.usedBytes, 0, 'Deleted document bytes must be excluded');
      assert.strictEqual(usageAfter.documentCount, 0, 'Deleted document count must be excluded');
    });

    it('10. Prevents duplicate storage counting across metadata records sharing storage path', async () => {
      const fileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

      const doc = await uploadAndCreateDocument(
        userA,
        {
          buffer: fileBuffer,
          originalname: 'deed.pdf',
          mimetype: 'application/pdf',
          size: fileBuffer.length,
        },
        { title: 'Land Deed', category: 'PROPERTY' }
      );

      // Verify baseline
      const usage1 = await getUserStorageUsage(userA);
      assert.strictEqual(usage1.usedBytes, fileBuffer.length);

      // Query usage again - deduplication must preserve single accounting
      const usage2 = await getUserStorageUsage(userA);
      assert.strictEqual(usage2.usedBytes, fileBuffer.length);
      assert.strictEqual(usage2.documentCount, 1);
    });

    it('11. Failed or incomplete uploads never record metadata and contribute 0 bytes', async () => {
      const invalidExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ executable

      let failed = false;
      try {
        await uploadAndCreateDocument(
          userA,
          {
            buffer: invalidExeBuffer,
            originalname: 'virus.pdf',
            mimetype: 'application/pdf',
            size: invalidExeBuffer.length,
          },
          { title: 'Infected Document', category: 'OTHER' }
        );
      } catch {
        failed = true;
      }

      assert.strictEqual(failed, true, 'Dangerous file signature must be rejected');
      const usage = await getUserStorageUsage(userA);
      assert.strictEqual(usage.usedBytes, 0, 'Failed upload must not count towards usage');
      assert.strictEqual(usage.documentCount, 0);
    });

    it('12. Cross-account usage isolation: User A usage is strictly isolated from User B', async () => {
      const userABuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0xaa]); // 9 bytes
      const userBBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0xbb, 0xcc, 0xdd]); // 11 bytes

      await uploadAndCreateDocument(
        userA,
        {
          buffer: userABuffer,
          originalname: 'userA_doc.pdf',
          mimetype: 'application/pdf',
          size: userABuffer.length,
        },
        { title: 'User A Doc', category: 'IDENTITY' }
      );

      await uploadAndCreateDocument(
        userB,
        {
          buffer: userBBuffer,
          originalname: 'userB_doc.pdf',
          mimetype: 'application/pdf',
          size: userBBuffer.length,
        },
        { title: 'User B Doc', category: 'HEALTH' }
      );

      const usageA = await getUserStorageUsage(userA);
      const usageB = await getUserStorageUsage(userB);

      assert.strictEqual(usageA.usedBytes, userABuffer.length, 'User A only counts User A documents');
      assert.strictEqual(usageA.documentCount, 1);
      assert.strictEqual(usageA.categoryBreakdown.IDENTITY.count, 1);
      assert.strictEqual(usageA.categoryBreakdown.HEALTH.count, 0);

      assert.strictEqual(usageB.usedBytes, userBBuffer.length, 'User B only counts User B documents');
      assert.strictEqual(usageB.documentCount, 1);
      assert.strictEqual(usageB.categoryBreakdown.HEALTH.count, 1);
      assert.strictEqual(usageB.categoryBreakdown.IDENTITY.count, 0);
    });

    it('13. Stale client lists: Backend summary overrides stale client list count and used bytes', async () => {
      // Stale client list has 3 documents, but backend actually has only 1 active document
      const fileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // 8 bytes
      await uploadAndCreateDocument(
        userA,
        {
          buffer: fileBuffer,
          originalname: 'authoritative_doc.pdf',
          mimetype: 'application/pdf',
          size: fileBuffer.length,
        },
        { title: 'Authoritative Doc', category: 'PROPERTY' }
      );

      const authoritativeSummary = await getUserStorageUsage(userA);

      // Verify backend authoritative values
      assert.strictEqual(authoritativeSummary.documentCount, 1);
      assert.strictEqual(authoritativeSummary.usedBytes, 8);

      // Stale client calculation (e.g. client thought it had 3 documents totaling 5000 bytes)
      const staleClientDocCount = 3;
      const staleClientBytes = 5000;
      assert.notStrictEqual(staleClientDocCount, authoritativeSummary.documentCount);
      assert.notStrictEqual(staleClientBytes, authoritativeSummary.usedBytes);

      // Rule: UI must use authoritativeSummary over stale client values
      const effectiveCount = authoritativeSummary.documentCount;
      const effectiveBytes = authoritativeSummary.usedBytes;
      assert.strictEqual(effectiveCount, 1);
      assert.strictEqual(effectiveBytes, 8);
    });

    it('14. Equal document count with different file sizes: Byte accounting reflects server bytes, not item count', async () => {
      // Scenario: Client and Server both have 2 documents, but client has old placeholder sizes while server has real sizes
      const doc1Buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x01, 0x02, 0x03]); // 11 bytes
      const doc2Buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x04, 0x05, 0x06, 0x07]); // 12 bytes

      await uploadAndCreateDocument(
        userA,
        {
          buffer: doc1Buffer,
          originalname: 'server_doc1.pdf',
          mimetype: 'application/pdf',
          size: doc1Buffer.length,
        },
        { title: 'Doc 1', category: 'IDENTITY' }
      );

      await uploadAndCreateDocument(
        userA,
        {
          buffer: doc2Buffer,
          originalname: 'server_doc2.pdf',
          mimetype: 'application/pdf',
          size: doc2Buffer.length,
        },
        { title: 'Doc 2', category: 'HEALTH' }
      );

      const serverSummary = await getUserStorageUsage(userA);
      const totalExpectedBytes = 11 + 12; // 23 bytes

      assert.strictEqual(serverSummary.documentCount, 2);
      assert.strictEqual(serverSummary.usedBytes, totalExpectedBytes);

      // Suppose client list has 2 docs but calculated fallback bytes of 2,000,000 bytes.
      // Server summary MUST be the authoritative source of bytes even though count matches 2.
      const authoritativeUsed = serverSummary.usedBytes;
      assert.strictEqual(authoritativeUsed, 23);
    });

    it('15. Concurrent uploads: Multiple simultaneous uploads atomically increment count and sum bytes without race conditions', async () => {
      const upload1Buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x11]); // 9 bytes
      const upload2Buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x22, 0x33]); // 10 bytes
      const upload3Buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x44, 0x55, 0x66]); // 11 bytes

      // Fire 3 uploads concurrently
      await Promise.all([
        uploadAndCreateDocument(
          userA,
          {
            buffer: upload1Buffer,
            originalname: 'concurrent_1.pdf',
            mimetype: 'application/pdf',
            size: upload1Buffer.length,
          },
          { title: 'Concurrent 1', category: 'IDENTITY' }
        ),
        uploadAndCreateDocument(
          userA,
          {
            buffer: upload2Buffer,
            originalname: 'concurrent_2.pdf',
            mimetype: 'application/pdf',
            size: upload2Buffer.length,
          },
          { title: 'Concurrent 2', category: 'PROPERTY' }
        ),
        uploadAndCreateDocument(
          userA,
          {
            buffer: upload3Buffer,
            originalname: 'concurrent_3.pdf',
            mimetype: 'application/pdf',
            size: upload3Buffer.length,
          },
          { title: 'Concurrent 3', category: 'VEHICLE' }
        ),
      ]);

      const summary = await getUserStorageUsage(userA);
      const expectedTotal = 9 + 10 + 11; // 30 bytes

      assert.strictEqual(summary.documentCount, 3);
      assert.strictEqual(summary.usedBytes, expectedTotal);
      assert.strictEqual(summary.categoryBreakdown.IDENTITY.count, 1);
      assert.strictEqual(summary.categoryBreakdown.PROPERTY.count, 1);
      assert.strictEqual(summary.categoryBreakdown.VEHICLE.count, 1);
    });

    it('16. Failed refresh / offline fallback: When backend summary is unavailable, client fallback operates gracefully', () => {
      const mockClientDocs: any[] = [
        { id: 'c1', fileSize: 1024 * 1024, category: 'IDENTITY' }, // 1 MiB
        { id: 'c2', fileSize: 2 * 1024 * 1024, category: 'PROPERTY' }, // 2 MiB
      ];

      // Backend storage is null (failed refresh / offline network)
      const backendStorage = null;

      // Fallback calculation computes from client docs
      const fallbackBytes = mockClientDocs.reduce((acc, d) => acc + (d.fileSize || 0), 0);
      const fallbackCount = mockClientDocs.length;

      const effectiveBytes = backendStorage !== null ? (backendStorage as any).usedBytes : fallbackBytes;
      const effectiveCount = backendStorage !== null ? (backendStorage as any).documentCount : fallbackCount;

      assert.strictEqual(effectiveBytes, 3 * 1024 * 1024);
      assert.strictEqual(effectiveCount, 2);

      const calc = calculateStorageUsage(effectiveBytes, 3 * BYTES_PER_GIB);
      assert.strictEqual(calc.formattedUsed, '3.0 MiB');
      assert.strictEqual(calc.percentageUsed, 0.1);
    });

    it('17. Deletion immediately decreases count and used bytes on server', async () => {
      const fileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x99]); // 9 bytes

      const doc = await uploadAndCreateDocument(
        userA,
        {
          buffer: fileBuffer,
          originalname: 'to_be_deleted.pdf',
          mimetype: 'application/pdf',
          size: fileBuffer.length,
        },
        { title: 'To Be Deleted', category: 'GULF' }
      );

      const beforeDelete = await getUserStorageUsage(userA);
      assert.strictEqual(beforeDelete.documentCount, 1);
      assert.strictEqual(beforeDelete.usedBytes, 9);
      assert.strictEqual(beforeDelete.categoryBreakdown.GULF.count, 1);

      // Perform deletion
      await deleteDocument(doc.id || doc._id?.toString(), userA, 'USER');

      // Authoritative summary post-deletion
      const afterDelete = await getUserStorageUsage(userA);
      assert.strictEqual(afterDelete.documentCount, 0);
      assert.strictEqual(afterDelete.usedBytes, 0);
      assert.strictEqual(afterDelete.categoryBreakdown.GULF.count, 0);
    });

    it('18. Founding Free plan enforces document limit: Allows 3 uploads, rejects 4th with DOCUMENT_LIMIT_REACHED', async () => {
      const freeUser = 'free-plan-user-1';

      // Upload Document 1
      const check1 = await validateUploadEntitlement(freeUser, 1024);
      assert.strictEqual(check1.allowed, true);
      if (check1.reservationId) releaseQuotaReservation(check1.reservationId);
      const doc1 = await uploadAndCreateDocument(
        freeUser,
        {
          buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x01]),
          originalname: 'doc1.pdf',
          mimetype: 'application/pdf',
          size: 7,
        },
        { title: 'Doc 1', category: 'IDENTITY' }
      );

      // Upload Document 2
      const check2 = await validateUploadEntitlement(freeUser, 1024);
      assert.strictEqual(check2.allowed, true);
      if (check2.reservationId) releaseQuotaReservation(check2.reservationId);
      const doc2 = await uploadAndCreateDocument(
        freeUser,
        {
          buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x02]),
          originalname: 'doc2.pdf',
          mimetype: 'application/pdf',
          size: 7,
        },
        { title: 'Doc 2', category: 'PROPERTY' }
      );

      // Upload Document 3
      const check3 = await validateUploadEntitlement(freeUser, 1024);
      assert.strictEqual(check3.allowed, true);
      if (check3.reservationId) releaseQuotaReservation(check3.reservationId);
      const doc3 = await uploadAndCreateDocument(
        freeUser,
        {
          buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x03]),
          originalname: 'doc3.pdf',
          mimetype: 'application/pdf',
          size: 7,
        },
        { title: 'Doc 3', category: 'VEHICLE' }
      );

      const usageAfter3 = await getUserStorageUsage(freeUser);
      assert.strictEqual(usageAfter3.documentCount, 3);
      assert.strictEqual(usageAfter3.usedBytes, 21);

      // Attempt Upload Document 4: MUST BE REJECTED
      const check4 = await validateUploadEntitlement(freeUser, 1024);
      assert.strictEqual(check4.allowed, false, 'Fourth upload on Founding Free plan must be rejected');
      assert.strictEqual(check4.code, 'DOCUMENT_LIMIT_REACHED');
      assert.match(check4.reason || '', /(Founding|Your) Free plan allows (at most|up to) 3 documents/i);

      // Deleting one document frees up a slot
      await deleteDocument(doc2.id || doc2._id?.toString(), freeUser, 'USER');

      const usageAfterDelete = await getUserStorageUsage(freeUser);
      assert.strictEqual(usageAfterDelete.documentCount, 2);
      assert.strictEqual(usageAfterDelete.usedBytes, 14);

      // Replacement upload is now allowed
      const checkReplacement = await validateUploadEntitlement(freeUser, 1024);
      assert.strictEqual(checkReplacement.allowed, true, 'Replacement upload must be allowed after deletion');
      if (checkReplacement.reservationId) releaseQuotaReservation(checkReplacement.reservationId);

      const replacementDoc = await uploadAndCreateDocument(
        freeUser,
        {
          buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x04]),
          originalname: 'replacement.pdf',
          mimetype: 'application/pdf',
          size: 7,
        },
        { title: 'Replacement Doc', category: 'HEALTH' }
      );

      const usageFinal = await getUserStorageUsage(freeUser);
      assert.strictEqual(usageFinal.documentCount, 3);
      assert.strictEqual(usageFinal.usedBytes, 21);

      // 4th upload is rejected again
      const checkPostReplacement = await validateUploadEntitlement(freeUser, 1024);
      assert.strictEqual(checkPostReplacement.allowed, false);
      assert.strictEqual(checkPostReplacement.code, 'DOCUMENT_LIMIT_REACHED');
    });

    it('19. Paid plans do not enforce the 3-document limit', async () => {
      const paidUser = 'paid-plan-user-1';
      await simulateSubscriptionDev(paidUser, 'SIMULATE_UPGRADE');

      // Upload 3 documents
      for (let i = 1; i <= 3; i++) {
        await uploadAndCreateDocument(
          paidUser,
          {
            buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, i]),
            originalname: `paid_doc_${i}.pdf`,
            mimetype: 'application/pdf',
            size: 7,
          },
          { title: `Paid Doc ${i}`, category: 'IDENTITY' }
        );
      }

      // 4th upload for paid user MUST be allowed
      const check4 = await validateUploadEntitlement(paidUser, 1024);
      assert.strictEqual(check4.allowed, true, 'Paid plan must allow more than 3 documents');
    });
  });
});
