import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

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
  confirmQuotaReservation,
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  _resetMockSubscriptions,
  simulateSubscriptionDev,
} from './subscriptionService';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';

describe('Founding Free Plan — 3-Document Limit Enforcement & Upload Safety', () => {
  const householdA = '507f1f77bcf86cd799439011';
  const householdB = '507f1f77bcf86cd799439022';

  // Valid PDF header bytes (%PDF-1.7...)
  const makePdfBuffer = (seed: number) =>
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, seed & 0xff, 0x0a]);

  beforeEach(() => {
    clearMockDocStore();
    _resetMockSubscriptions();
  });

  it('1. The first three Free plan documents can be uploaded successfully', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // Document 1
    const check1 = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(check1.allowed, true, 'First upload must be permitted');
    const doc1 = await uploadAndCreateDocument(
      householdA,
      {
        buffer: makePdfBuffer(1),
        originalname: 'doc1.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      },
      { title: 'Doc 1', category: 'IDENTITY' }
    );
    assert.ok(doc1 && doc1.id);
    confirmQuotaReservation(check1.reservationId!);

    // Document 2
    const check2 = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(check2.allowed, true, 'Second upload must be permitted');
    const doc2 = await uploadAndCreateDocument(
      householdA,
      {
        buffer: makePdfBuffer(2),
        originalname: 'doc2.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      },
      { title: 'Doc 2', category: 'IDENTITY' }
    );
    assert.ok(doc2 && doc2.id);
    confirmQuotaReservation(check2.reservationId!);

    // Document 3
    const check3 = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(check3.allowed, true, 'Third upload must be permitted');
    const doc3 = await uploadAndCreateDocument(
      householdA,
      {
        buffer: makePdfBuffer(3),
        originalname: 'doc3.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      },
      { title: 'Doc 3', category: 'IDENTITY' }
    );
    assert.ok(doc3 && doc3.id);
    confirmQuotaReservation(check3.reservationId!);

    // Authoritative check
    const usage = await getUserStorageUsage(householdA);
    assert.strictEqual(usage.documentCount, 3, 'Household must have exactly 3 documents stored');
  });

  it('2. A fourth document is rejected with DOCUMENT_LIMIT_REACHED and actionable error message', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // Populate 3 documents
    for (let i = 1; i <= 3; i++) {
      await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `doc_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Doc ${i}`, category: 'IDENTITY' }
      );
    }

    const usageBefore = await getUserStorageUsage(householdA);
    assert.strictEqual(usageBefore.documentCount, 3);

    // 4th upload attempt
    const check4 = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(check4.allowed, false, 'Fourth document must be rejected');
    assert.strictEqual(check4.code, 'DOCUMENT_LIMIT_REACHED');
    assert.strictEqual(
      check4.reason,
      'Your Free plan allows up to 3 documents. Upgrade your plan to upload more.'
    );
  });

  it('3. Deleting an eligible document restores allowance and permits a replacement upload', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // Upload 3 documents
    let lastDocId = '';
    for (let i = 1; i <= 3; i++) {
      const doc = await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `doc_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Doc ${i}`, category: 'IDENTITY' }
      );
      lastDocId = doc.id;
    }

    // Verify 4th is blocked
    const blockedCheck = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(blockedCheck.allowed, false);
    assert.strictEqual(blockedCheck.code, 'DOCUMENT_LIMIT_REACHED');

    // Delete 1 document (soft delete)
    const deleteResult = await deleteDocument(lastDocId, householdA);
    assert.strictEqual(deleteResult.success, true);

    const usageAfterDelete = await getUserStorageUsage(householdA);
    assert.strictEqual(usageAfterDelete.documentCount, 2, 'Count should be 2 after soft-deletion');

    // Replacement upload must now succeed
    const replacementCheck = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(replacementCheck.allowed, true, 'Replacement document must now be allowed');

    const replacementDoc = await uploadAndCreateDocument(
      householdA,
      {
        buffer: makePdfBuffer(99),
        originalname: 'replacement.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      },
      { title: 'Replacement Doc', category: 'PROPERTY' }
    );
    assert.ok(replacementDoc && replacementDoc.id);

    const usageFinal = await getUserStorageUsage(householdA);
    assert.strictEqual(usageFinal.documentCount, 3);
  });

  it('4. Failed uploads and released reservations do not consume a document slot', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // Have 2 documents
    for (let i = 1; i <= 2; i++) {
      await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `doc_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Doc ${i}`, category: 'IDENTITY' }
      );
    }

    // Simulate an in-flight upload that reserves a slot but fails
    const attempt1 = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(attempt1.allowed, true);
    assert.ok(attempt1.reservationId);

    // Concurrently, 4th request while 3rd is in-flight must be rejected
    const concurrentBlocked = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(concurrentBlocked.allowed, false, 'Should block because 2 + 1 in-flight = 3');

    // The in-flight upload fails -> release reservation
    releaseQuotaReservation(attempt1.reservationId!);

    // Now slot is released, subsequent upload is allowed
    const retryAttempt = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(retryAttempt.allowed, true, 'Slot must be freed upon releasing reservation');
    if (retryAttempt.reservationId) {
      releaseQuotaReservation(retryAttempt.reservationId);
    }
  });

  it('5. Concurrent requests cannot bypass the 3-document limit', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // Have 2 documents
    for (let i = 1; i <= 2; i++) {
      await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `doc_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Doc ${i}`, category: 'IDENTITY' }
      );
    }

    // Launch 3 simultaneous upload entitlement checks for the remaining 1 slot
    const [res1, res2, res3] = await Promise.all([
      validateUploadEntitlement(householdA, 1024),
      validateUploadEntitlement(householdA, 1024),
      validateUploadEntitlement(householdA, 1024),
    ]);

    const allowedCount = [res1, res2, res3].filter((r) => r.allowed).length;
    const rejectedCount = [res1, res2, res3].filter((r) => !r.allowed).length;

    assert.strictEqual(allowedCount, 1, 'Exactly one concurrent request should be allowed');
    assert.strictEqual(rejectedCount, 2, 'Other simultaneous requests must be rejected');

    // Cleanup reservations
    [res1, res2, res3].forEach((r) => {
      if (r.reservationId) releaseQuotaReservation(r.reservationId);
    });
  });

  it('6. One household cannot consume another household’s document allowance', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');
    await simulateSubscriptionDev(householdB, 'START_TRIAL');

    // Fill household A's quota with 3 documents
    for (let i = 1; i <= 3; i++) {
      await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `doc_a_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Doc A ${i}`, category: 'IDENTITY' }
      );
    }

    // Household A is at limit
    const checkA = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(checkA.allowed, false);
    assert.strictEqual(checkA.code, 'DOCUMENT_LIMIT_REACHED');

    // Household B has 0 documents and must still be allowed to upload
    const checkB = await validateUploadEntitlement(householdB, 1024);
    assert.strictEqual(checkB.allowed, true, 'Household B must not be affected by Household A');

    const docB = await uploadAndCreateDocument(
      householdB,
      {
        buffer: makePdfBuffer(10),
        originalname: 'doc_b_1.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      },
      { title: 'Doc B 1', category: 'HEALTH' }
    );
    assert.ok(docB && docB.id);

    const usageA = await getUserStorageUsage(householdA);
    const usageB = await getUserStorageUsage(householdB);
    assert.strictEqual(usageA.documentCount, 3);
    assert.strictEqual(usageB.documentCount, 1);
  });

  it('7. Paid plans (NRI Family Plus & Partners) do not have the 3-document limit', async () => {
    // Upgrade household A to NRI Family Plus
    await simulateSubscriptionDev(householdA, 'SIMULATE_UPGRADE');

    const entitlement = await evaluateUserEntitlement(householdA);
    assert.strictEqual(entitlement.planId, 'nri-plus');
    assert.strictEqual(entitlement.maxDocuments, undefined, 'Paid plan must not have 3-doc limit');

    // Upload 5 documents without hitting document count limit
    for (let i = 1; i <= 5; i++) {
      const check = await validateUploadEntitlement(householdA, 1024);
      assert.strictEqual(check.allowed, true, `Paid plan upload ${i} must be allowed`);
      await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `paid_doc_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Paid Doc ${i}`, category: 'IDENTITY' }
      );
    }

    const usage = await getUserStorageUsage(householdA);
    assert.strictEqual(usage.documentCount, 5);
  });

  it('8. Storage quota (3 GiB), file-size (25 MiB), and trial expiry checks operate independently', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // 8a. Single file exceeding 25 MiB limit (26 MiB) is rejected even when document count is 0
    const oversizedFile = 26 * 1024 * 1024;
    const checkOversized = await validateUploadEntitlement(householdA, oversizedFile);
    assert.strictEqual(checkOversized.allowed, false);
    assert.match(checkOversized.reason || '', /File size exceeds the plan limit/i);

    // 8b. Storage quota check rejects file larger than 3 GiB
    const overQuota = 4 * 1024 * 1024 * 1024;
    const checkOverQuota = await validateUploadEntitlement(householdA, overQuota);
    assert.strictEqual(checkOverQuota.allowed, false);
    assert.match(checkOverQuota.reason || '', /exceeds the plan limit|quota exceeded/i);

    // 8c. Expiring the trial blocks uploads even with 0 documents
    await simulateSubscriptionDev(householdA, 'EXPIRE_TRIAL');
    const checkExpired = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(checkExpired.allowed, false);
    assert.match(checkExpired.reason || '', /trial has expired/i);
  });

  it('9. Existing Free households with more than 3 documents retain access but cannot add more', async () => {
    await simulateSubscriptionDev(householdA, 'START_TRIAL');

    // Simulate an existing account that already has 5 documents
    for (let i = 1; i <= 5; i++) {
      await uploadAndCreateDocument(
        householdA,
        {
          buffer: makePdfBuffer(i),
          originalname: `legacy_doc_${i}.pdf`,
          mimetype: 'application/pdf',
          size: 1024,
        },
        { title: `Legacy Doc ${i}`, category: 'IDENTITY' }
      );
    }

    const usage = await getUserStorageUsage(householdA);
    assert.strictEqual(usage.documentCount, 5, 'All 5 legacy documents remain intact and preserved');

    // New upload is blocked
    const check = await validateUploadEntitlement(householdA, 1024);
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.code, 'DOCUMENT_LIMIT_REACHED');

    // Viewing / entitlement reading remains fully authorized
    const entitlement = await evaluateUserEntitlement(householdA);
    assert.strictEqual(entitlement.canDownloadOrView, true, 'User must retain viewing and download rights');
  });
});
