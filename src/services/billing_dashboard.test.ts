process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBillingOverview,
  getBillingHistory,
  getBillingReceipt,
  cancelUserSubscription,
} from './billingService';
import {
  createPaymentRequest,
  submitPaymentProof,
  approvePaymentRequest,
  rejectPaymentRequest,
} from './paymentService';
import {
  getOrCreateUserSubscription,
  updateSubscriptionStatus,
  _resetMockSubscriptions,
} from './subscriptionService';
import { clearMockPaymentRequests } from '../models/PaymentRequest';
import { clearMockPaymentHistories } from '../models/PaymentHistory';
import { clearMockUserSettingsStore, setMockUserSettings } from '../models/UserSettings';

test('Kudumba Vault — Dynamic Billing Dashboard Test Suite', async (t) => {
  const user1Id = '507f1f77bcf86cd799439011';
  const user2Id = '507f1f77bcf86cd799439022';
  const adminId = '507f1f77bcf86cd799439001';
  const adminEmail = 'admin@kudumbavault.com';

  const defaultAddress = {
    fullName: 'Ananthu Namboodiri',
    houseBuilding: 'Illam 4B',
    streetLocality: 'Kaloor',
    city: 'Kochi',
    state: 'Kerala',
    country: 'India',
    postalCode: '682017',
    phone: '+91 98460 11223',
  };

  t.beforeEach(() => {
    clearMockPaymentRequests();
    clearMockPaymentHistories();
    clearMockUserSettingsStore();
    _resetMockSubscriptions();
  });

  await t.test('1. Free user with no payment history', async () => {
    const sub = await getOrCreateUserSubscription(user1Id);
    assert.equal(sub.planId, 'founding-free');

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'FREE');
    assert.equal(overview.statusBadge.labelEn, 'FREE TRIAL ACTIVE');
    assert.equal(overview.subscription.planId, 'founding-free');
    assert.equal(overview.latestApprovedPayment, null);
    assert.equal(overview.activeRequest, null);
    assert.ok(overview.expiryOrRenewalDate, 'Free trial has trialEnd date');

    const history = await getBillingHistory(user1Id);
    assert.equal(history.records.length, 0);
    assert.equal(history.total, 0);
    assert.equal(history.totalPages, 1);
  });

  await t.test('2. User with pending UPI payment', async () => {
    // 1. Create payment request
    const req = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'yearly',
      billingAddress: defaultAddress,
    });

    // 2. Submit payment proof with UTR
    await submitPaymentProof(user1Id, {
      requestId: req._id ? req._id.toString() : String(req.id),
      utrNumber: 'SBI2026103001',
      paymentDate: new Date().toISOString(),
      file: { originalname: 'screenshot.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('test') },
    });

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'PENDING PAYMENT');
    assert.equal(overview.statusBadge.labelEn, 'PAYMENT PENDING VERIFICATION');
    assert.ok(overview.activeRequest);
    assert.equal(overview.activeRequest?.status, 'PENDING');
    assert.equal(overview.activeRequest?.utrNumber, 'SBI2026103001');
    assert.equal(overview.latestApprovedPayment, null);

    const history = await getBillingHistory(user1Id);
    assert.equal(history.records.length, 1);
    assert.equal(history.records[0].status, 'PENDING');
    assert.equal(history.records[0].hasReceipt, false, 'Pending payment must NOT issue a paid receipt');
  });

  await t.test('3. User with approved active subscription', async () => {
    const req = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'yearly',
      billingAddress: defaultAddress,
    });
    const reqId = req._id ? req._id.toString() : String(req.id);
    await submitPaymentProof(user1Id, {
      requestId: reqId,
      utrNumber: 'HDFC2026103002',
      paymentDate: new Date().toISOString(),
      file: { originalname: 'proof.png', mimetype: 'image/png', size: 2048, buffer: Buffer.from('test') },
    });

    // Admin approves payment
    await approvePaymentRequest(adminId, adminEmail, reqId);

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'ACTIVE');
    assert.equal(overview.statusBadge.labelEn, 'SUBSCRIPTION ACTIVE');
    assert.equal(overview.subscription.status, 'active');
    assert.equal(overview.subscription.planId, 'nri-plus');
    assert.ok(overview.latestApprovedPayment);
    assert.equal(overview.latestApprovedPayment?.utrNumber, 'HDFC2026103002');
    assert.equal(overview.latestApprovedPayment?.verificationStatus, 'APPROVED');

    const history = await getBillingHistory(user1Id);
    assert.equal(history.records.length, 1);
    assert.equal(history.records[0].status, 'PAID');
    assert.equal(history.records[0].hasReceipt, true);

    const receipt = await getBillingReceipt(user1Id, history.records[0].id);
    assert.equal(receipt.status, 'PAID');
    assert.equal(receipt.utrNumber, 'HDFC2026103002');
    assert.ok(receipt.receiptNumber.startsWith('KV-'));
    assert.ok(receipt.disclaimer.includes('official payment confirmation and receipt'));
  });

  await t.test('4. User with multiple approved payments', async () => {
    // 1st approved payment
    const req1 = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: defaultAddress,
    });
    const req1Id = req1._id ? req1._id.toString() : String(req1.id);
    await submitPaymentProof(user1Id, {
      requestId: req1Id,
      utrNumber: 'AXIS2026103001',
      paymentDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      file: { originalname: 'p1.png', mimetype: 'image/png', size: 1024, buffer: Buffer.from('test') },
    });
    await approvePaymentRequest(adminId, adminEmail, req1Id);

    // 2nd approved payment (renewal)
    const req2 = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'yearly',
      billingAddress: defaultAddress,
    });
    const req2Id = req2._id ? req2._id.toString() : String(req2.id);
    await submitPaymentProof(user1Id, {
      requestId: req2Id,
      utrNumber: 'AXIS2026103002',
      paymentDate: new Date().toISOString(),
      file: { originalname: 'p2.png', mimetype: 'image/png', size: 1024, buffer: Buffer.from('test') },
    });
    await approvePaymentRequest(adminId, adminEmail, req2Id);

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'ACTIVE');
    assert.equal(overview.latestApprovedPayment?.utrNumber, 'AXIS2026103002', 'Latest payment should be newest payment');

    const history = await getBillingHistory(user1Id);
    assert.equal(history.records.length, 2);
    assert.equal(history.records[0].utrNumber, 'AXIS2026103002', 'Newest transaction must be first');
    assert.equal(history.records[1].utrNumber, 'AXIS2026103001');
  });

  await t.test('5. User with rejected payment', async () => {
    const req = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: defaultAddress,
    });
    const reqId = req._id ? req._id.toString() : String(req.id);
    await submitPaymentProof(user1Id, {
      requestId: reqId,
      utrNumber: 'ICIC2026103003',
      paymentDate: new Date().toISOString(),
      file: { originalname: 'p3.png', mimetype: 'image/png', size: 1024, buffer: Buffer.from('test') },
    });

    // Admin rejects request
    await rejectPaymentRequest(adminId, adminEmail, reqId, 'UTR number does not match bank transaction record');

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'PAYMENT REJECTED');
    assert.equal(overview.statusBadge.labelEn, 'PAYMENT REJECTED');
    assert.equal(overview.activeRequest?.status, 'REJECTED');
    assert.equal(overview.activeRequest?.rejectionReason, 'UTR number does not match bank transaction record');

    const history = await getBillingHistory(user1Id);
    assert.equal(history.records[0].status, 'REJECTED');
    assert.equal(history.records[0].hasReceipt, false, 'Rejected payment must NOT issue receipt');
  });

  await t.test('6. User with expired subscription', async () => {
    await updateSubscriptionStatus(user1Id, 'expired');

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'EXPIRED');
    assert.equal(overview.statusBadge.labelEn, 'SUBSCRIPTION EXPIRED');
  });

  await t.test('7. User with scheduled cancellation', async () => {
    // Active subscription with currentPeriodEnd in 20 days
    const sub = await getOrCreateUserSubscription(user1Id);
    sub.status = 'active';
    sub.planId = 'nri-plus';
    sub.planName = 'NRI Family Plus';
    sub.currentPeriodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await sub.save();

    // User cancels subscription at end of term
    const cancelRes = await cancelUserSubscription(user1Id, true, 'User requested downgrade');
    assert.equal(cancelRes.ok, true);

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'CANCELLATION SCHEDULED');
    assert.equal(overview.statusBadge.labelEn, 'CANCELLATION SCHEDULED');
    assert.equal(overview.cancellation.isScheduled, true);
    assert.equal(overview.cancellation.cancelAtPeriodEnd, true);
    assert.ok((overview.cancellation.daysRemaining || 0) > 0);
  });

  await t.test('8. User with immediately cancelled subscription', async () => {
    const sub = await getOrCreateUserSubscription(user1Id);
    sub.status = 'active';
    await sub.save();

    // Immediate cancellation
    await cancelUserSubscription(user1Id, false, 'Immediate termination');

    const overview = await getBillingOverview(user1Id);
    assert.equal(overview.unifiedStatus, 'CANCELLED');
    assert.equal(overview.statusBadge.labelEn, 'SUBSCRIPTION CANCELLED');
  });

  await t.test('9. User with no saved billing address', async () => {
    const req = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'yearly',
      billingAddress: {
        fullName: 'Anoop Kumar',
        houseBuilding: 'Flat 1',
        streetLocality: 'MG Road',
        city: 'Kochi',
        state: 'Kerala',
        country: 'India',
        postalCode: '682001',
        phone: '+91 99999 11111',
      },
      saveBillingAddress: false, // Explicitly not saved to UserSettings
    });
    const reqId = req._id ? req._id.toString() : String(req.id);
    await submitPaymentProof(user1Id, {
      requestId: reqId,
      utrNumber: 'KOTAK2026103099',
      paymentDate: new Date().toISOString(),
      file: { originalname: 'proof.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('test') },
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // Receipt correctly falls back to snapshot even if UserSettings has no saved address
    const receipt = await getBillingReceipt(user1Id, reqId);
    assert.equal(receipt.customerName, 'Anoop Kumar');
    assert.equal(receipt.billingAddress?.city, 'Kochi');
  });

  await t.test('10. Security: Strictly prevents cross-household billing access', async () => {
    // User 1 creates and completes an approved payment
    const req = await createPaymentRequest(user1Id, {
      planId: 'nri-plus',
      duration: 'yearly',
      billingAddress: defaultAddress,
    });
    const reqId = req._id ? req._id.toString() : String(req.id);
    await submitPaymentProof(user1Id, {
      requestId: reqId,
      utrNumber: 'SECRET20261030',
      paymentDate: new Date().toISOString(),
      file: { originalname: 'proof.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('test') },
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // User 2 attempts to fetch User 1's receipt using User 1's payment ID
    await assert.rejects(
      async () => {
        await getBillingReceipt(user2Id, reqId);
      },
      /Unauthorized access: You cannot access billing records of another household/
    );

    // User 2's billing history must NOT contain User 1's transaction
    const user2History = await getBillingHistory(user2Id);
    assert.equal(user2History.records.length, 0);
  });
});
