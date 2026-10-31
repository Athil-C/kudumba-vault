process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateUserEntitlement,
  getOrCreateUserSubscription,
  validateUploadEntitlement,
  _resetMockSubscriptions,
} from './subscriptionService';
import {
  getUserStorageUsage,
  uploadAndCreateDocument,
  clearMockDocStore,
} from './documentService';
import {
  calculatePlanPricing,
  createPaymentRequest,
  submitPaymentProof,
  approvePaymentRequest,
} from './paymentService';
import { clearMockPaymentRequests } from '../models/PaymentRequest';
import { clearMockPaymentHistories } from '../models/PaymentHistory';
import { calculateStorageUsage, BYTES_PER_GIB } from '../utils/vaultLogic';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';

test('Kudumba Vault — Authoritative Storage Quota & Entitlement Consistency', async (t) => {
  const testUserId = '507f1f77bcf86cd799439099';
  const adminId = '507f1f77bcf86cd799439001';
  const adminEmail = 'admin@kudumbavault.com';

  const billingAddress = {
    fullName: 'Mohan Kumar',
    houseBuilding: 'Rose Villa 12A',
    streetLocality: 'Palarivattom',
    city: 'Kochi',
    state: 'Kerala',
    country: 'India',
    postalCode: '682025',
    phone: '+91 98471 23456',
  };

  t.beforeEach(() => {
    clearMockPaymentRequests();
    clearMockPaymentHistories();
    _resetMockSubscriptions();
    clearMockDocStore();
  });

  await t.test('1. Free plan displays 3 GB authoritative storage quota', async () => {
    // Initial user begins with Founding Household free plan
    const sub = await getOrCreateUserSubscription(testUserId);
    assert.equal(sub.planId, 'founding-free');

    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.planId, 'founding-free');
    assert.equal(entitlement.storageQuotaBytes, 3 * BYTES_PER_GIB);
    assert.equal(entitlement.maxFamilyMembers, 5);
    assert.equal(entitlement.maxFileSizeBytes, 25 * 1024 * 1024);

    const usageReport = await getUserStorageUsage(testUserId);
    assert.equal(usageReport.quotaBytes, 3 * BYTES_PER_GIB);
    assert.equal(usageReport.quotaGiB, 3.0);
    assert.equal(usageReport.planName, AUTHORITATIVE_PLANS['founding-free'].nameEn);

    // Formatted storage calculation matches 3 GB
    const calc = calculateStorageUsage(usageReport.usedBytes, entitlement.storageQuotaBytes);
    const displayQuota = calc.formattedQuota.replace('.0 GiB', ' GB').replace('GiB', 'GB');
    assert.equal(displayQuota, '3 GB');
  });

  await t.test('2. NRI Family Plus displays 15 GB authoritative storage quota after manual approval', async () => {
    // User creates and submits payment for NRI Family Plus
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress,
    });
    const reqId = req.id || req._id.toString();

    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'SBI2026103001',
      paymentDate: new Date().toISOString(),
    });

    // Admin verifies and approves
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // Active subscription must determine quota
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.status, 'active');
    assert.equal(entitlement.planId, 'nri-plus');
    assert.equal(entitlement.storageQuotaBytes, 15 * BYTES_PER_GIB);
    assert.equal(entitlement.maxFamilyMembers, 12);
    assert.equal(entitlement.maxFileSizeBytes, 50 * 1024 * 1024);

    // Backend storage accounting returns 15 GB quota
    const usageReport = await getUserStorageUsage(testUserId);
    assert.equal(usageReport.quotaBytes, 15 * BYTES_PER_GIB);
    assert.equal(usageReport.quotaGiB, 15.0);
    assert.equal(usageReport.planName, 'NRI Family Plus');

    // Storage calculation formatting reflects 15 GB
    const calc = calculateStorageUsage(usageReport.usedBytes, entitlement.storageQuotaBytes);
    const displayQuota = calc.formattedQuota.replace('.0 GiB', ' GB').replace('GiB', 'GB');
    const displayUsed = calc.formattedUsed.replace('GiB', 'GB').replace('MiB', 'MB');
    assert.equal(displayQuota, '15 GB');
    assert.equal(`${displayUsed} of ${displayQuota}`, '0.0 GB of 15 GB');
  });

  await t.test('3. Partners & Societies displays 100 GB authoritative storage quota after approval', async () => {
    const req = await createPaymentRequest(testUserId, {
      planId: 'partner-pro',
      duration: 'monthly',
      billingAddress,
    });
    const reqId = req.id || req._id.toString();

    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'HDFC2026103002',
      paymentDate: new Date().toISOString(),
    });

    await approvePaymentRequest(adminId, adminEmail, reqId);

    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.status, 'active');
    assert.equal(entitlement.planId, 'partner-pro');
    assert.equal(entitlement.storageQuotaBytes, 100 * BYTES_PER_GIB);
    assert.equal(entitlement.maxFamilyMembers, 50);

    const usageReport = await getUserStorageUsage(testUserId);
    assert.equal(usageReport.quotaBytes, 100 * BYTES_PER_GIB);
    assert.equal(usageReport.quotaGiB, 100.0);
    assert.equal(usageReport.planName, 'Partners & Societies');

    const calc = calculateStorageUsage(usageReport.usedBytes, entitlement.storageQuotaBytes);
    const displayQuota = calc.formattedQuota.replace('.0 GiB', ' GB').replace('GiB', 'GB');
    assert.equal(displayQuota, '100 GB');
  });

  await t.test('4. Existing document usage remains unchanged after subscription upgrade', async () => {
    // 1. Upload 2 documents while on free plan (10 MB total)
    const docSize1 = 4 * 1024 * 1024; // 4 MB
    const docSize2 = 6 * 1024 * 1024; // 6 MB
    const totalDocSize = docSize1 + docSize2;

    const pdfBuffer1 = Buffer.concat([Buffer.from('%PDF-1.5 test doc 1 '), Buffer.alloc(docSize1 - 20)]);
    const pdfBuffer2 = Buffer.concat([Buffer.from('%PDF-1.5 test doc 2 '), Buffer.alloc(docSize2 - 20)]);

    await uploadAndCreateDocument(
      testUserId,
      { originalname: 'aadhaar.pdf', mimetype: 'application/pdf', size: docSize1, buffer: pdfBuffer1 },
      { title: 'Aadhaar Card', category: 'IDENTITY' }
    );
    await uploadAndCreateDocument(
      testUserId,
      { originalname: 'tax_deed.pdf', mimetype: 'application/pdf', size: docSize2, buffer: pdfBuffer2 },
      { title: 'House Tax Deed', category: 'PROPERTY' }
    );

    const initialUsage = await getUserStorageUsage(testUserId);
    assert.equal(initialUsage.documentCount, 2);
    assert.equal(initialUsage.usedBytes, totalDocSize);
    assert.equal(initialUsage.quotaBytes, 3 * BYTES_PER_GIB);

    // 2. User purchases and admin approves NRI Family Plus
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress,
    });
    const reqId = req.id || req._id.toString();

    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'AXIS2026103003',
      paymentDate: new Date().toISOString(),
    });

    await approvePaymentRequest(adminId, adminEmail, reqId);

    // 3. Document count and usedBytes must remain strictly identical
    const upgradedUsage = await getUserStorageUsage(testUserId);
    assert.equal(upgradedUsage.documentCount, 2, 'Document count must not change on upgrade');
    assert.equal(upgradedUsage.usedBytes, totalDocSize, 'Used storage bytes must not reset on upgrade');
    assert.equal(upgradedUsage.quotaBytes, 15 * BYTES_PER_GIB, 'Quota must expand to 15 GB');
  });

  await t.test('5. Storage percentage uses the correct active plan quota', () => {
    // 1.5 GiB of stored documents
    const usedBytes = Math.round(1.5 * BYTES_PER_GIB);

    // Free plan (3 GiB quota) -> 1.5 / 3.0 = 50.0%
    const freeCalc = calculateStorageUsage(usedBytes, 3 * BYTES_PER_GIB);
    assert.equal(freeCalc.percentageUsed, 50);

    // NRI Plus (15 GiB quota) -> 1.5 / 15.0 = 10.0%
    const nriCalc = calculateStorageUsage(usedBytes, 15 * BYTES_PER_GIB);
    assert.equal(nriCalc.percentageUsed, 10);

    // Partners Pro (100 GiB quota) -> 1.5 / 100.0 = 1.5%
    const partnerCalc = calculateStorageUsage(usedBytes, 100 * BYTES_PER_GIB);
    assert.equal(partnerCalc.percentageUsed, 1.5);
  });

  await t.test('6. Backend upload validator enforces the active plan quota strictly', async () => {
    // Free plan: 3 GB quota limit. Try uploading 3.1 GB
    const overFreeSize = Math.round(3.1 * BYTES_PER_GIB);
    const checkFree = await validateUploadEntitlement(testUserId, overFreeSize);
    assert.equal(checkFree.allowed, false);
    assert.ok(checkFree.reason?.includes('exceeds the plan limit') || checkFree.reason?.includes('quota exceeded'));

    // Upgrade to NRI Family Plus (15 GB quota, 50 MB max file size)
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'KKBK2026103004',
      paymentDate: new Date().toISOString(),
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // 40 MB file (within 50 MB limit and within 15 GB quota) is allowed
    const validUpload = await validateUploadEntitlement(testUserId, 40 * 1024 * 1024);
    assert.equal(validUpload.allowed, true);

    // 60 MB file (exceeds 50 MB max file limit for NRI Plus) is rejected
    const oversizedFile = await validateUploadEntitlement(testUserId, 60 * 1024 * 1024);
    assert.equal(oversizedFile.allowed, false);
    assert.ok(oversizedFile.reason?.includes('limit of 50 MB'));

    // Upload exceeding remaining 15 GB quota is rejected
    const over15Gb = Math.round(16 * BYTES_PER_GIB);
    const overQuota = await validateUploadEntitlement(testUserId, over15Gb);
    assert.equal(overQuota.allowed, false);
  });
});
