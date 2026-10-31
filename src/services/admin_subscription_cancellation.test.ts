process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  adminCancelSubscription,
  _resetMockSubscriptions,
} from './subscriptionService';
import {
  approvePaymentRequest,
  createPaymentRequest,
  submitPaymentProof,
  getAdminPaymentRequests,
} from './paymentService';
import { clearMockPaymentRequests } from '../models/PaymentRequest';
import { clearMockPaymentHistories } from '../models/PaymentHistory';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';

test('Kudumba Vault — Admin Subscription Cancellation Suite', async (t) => {
  const testUserId = '507f1f77bcf86cd799439099';
  const adminId = '507f1f77bcf86cd799439001';
  const adminEmail = 'admin@kudumbavault.com';

  const validBillingAddress = {
    fullName: 'Anand Menon',
    houseBuilding: 'Sobha Silver Tower Flat 4B',
    streetLocality: 'Kaloor Road',
    city: 'Kochi',
    state: 'Kerala',
    country: 'India',
    postalCode: '682017',
    phone: '+91 98470 12345',
  };

  t.beforeEach(() => {
    clearMockPaymentRequests();
    clearMockPaymentHistories();
    _resetMockSubscriptions();
  });

  await t.test('1. Option A (END_OF_PERIOD): subscription remains active with full benefits until expiry', async () => {
    // Setup approved payment and active subscription
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '123456789012',
      paymentDate: '2026-10-30',
    });
    const approved = await approvePaymentRequest(adminId, adminEmail, reqId);
    assert.equal(approved.subscription.status, 'active');

    // Admin cancels at period end (Option A - DEFAULT)
    const result = await adminCancelSubscription(
      testUserId,
      { mode: 'END_OF_PERIOD', reason: 'Customer requested cancellation at end of paid month' },
      { adminId, adminEmail }
    );

    assert.equal(result.subscription.status, 'active', 'Subscription must remain active until period end');
    assert.equal(result.subscription.cancelAtPeriodEnd, true, 'cancelAtPeriodEnd flag must be true');
    assert.equal(result.subscription.cancellationMode, 'END_OF_PERIOD');
    assert.ok(result.subscription.cancelledAt, 'cancelledAt must be recorded');
    assert.equal(result.subscription.cancellationReason, 'Customer requested cancellation at end of paid month');

    // Verify user entitlement still has active paid benefits before currentPeriodEnd
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.status, 'active');
    assert.equal(entitlement.isActiveOrTrialing, true);
    assert.equal(entitlement.canUpload, true, 'User must retain upload privilege while period is active');
    assert.equal(entitlement.cancelAtPeriodEnd, true);
    assert.equal(entitlement.cancellationMode, 'END_OF_PERIOD');
  });

  await t.test('2. Option A (END_OF_PERIOD): transitions to expired after currentPeriodEnd elapses', async () => {
    // Setup active subscription with past periodEnd
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '223456789012',
      paymentDate: '2026-10-30',
    });
    const approved = await approvePaymentRequest(adminId, adminEmail, reqId);

    // Cancel at period end
    await adminCancelSubscription(
      testUserId,
      { mode: 'END_OF_PERIOD' },
      { adminId, adminEmail }
    );

    // Manually advance sub.currentPeriodEnd into the past to simulate end-of-period expiration
    approved.subscription.currentPeriodEnd = new Date(Date.now() - 1000);
    await approved.subscription.save();

    // Entitlement evaluation should transition it to expired
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.status, 'expired');
    assert.equal(entitlement.isActiveOrTrialing, false);
    assert.equal(entitlement.canUpload, false, 'Expired subscription must block new uploads');
    assert.equal(entitlement.canDownloadOrView, true, 'Existing documents must remain readable and safe');
  });

  await t.test('3. Option B (IMMEDIATE): immediately revokes paid benefits with mandatory reason', async () => {
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '323456789012',
      paymentDate: '2026-10-30',
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // Immediate cancellation requires a reason with at least 5 characters
    await assert.rejects(
      async () => {
        await adminCancelSubscription(
          testUserId,
          { mode: 'IMMEDIATE', reason: '' },
          { adminId, adminEmail }
        );
      },
      /reason.*at least 5 characters/i
    );

    await assert.rejects(
      async () => {
        await adminCancelSubscription(
          testUserId,
          { mode: 'IMMEDIATE', reason: 'abc' },
          { adminId, adminEmail }
        );
      },
      /reason.*at least 5 characters/i
    );

    // Perform valid immediate cancellation
    const result = await adminCancelSubscription(
      testUserId,
      { mode: 'IMMEDIATE', reason: 'Immediate administrative termination requested by household head' },
      { adminId, adminEmail }
    );

    assert.equal(result.subscription.status, 'canceled');
    assert.equal(result.subscription.cancelAtPeriodEnd, false);
    assert.equal(result.subscription.cancellationMode, 'IMMEDIATE');
    assert.ok(result.subscription.cancelledAt);

    // Verify entitlements: immediate revocation of upload rights, but documents preserved
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.status, 'canceled');
    assert.equal(entitlement.isActiveOrTrialing, false);
    assert.equal(entitlement.canUpload, false, 'Immediate cancellation must revoke upload privileges immediately');
    assert.equal(entitlement.canDownloadOrView, true, 'Immediate cancellation must strictly preserve document access');
  });

  await t.test('4. Duplicate cancellation guard: prevents re-cancelling already cancelled subscriptions', async () => {
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '423456789012',
      paymentDate: '2026-10-30',
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // Cancel immediately
    await adminCancelSubscription(
      testUserId,
      { mode: 'IMMEDIATE', reason: 'First valid immediate cancellation' },
      { adminId, adminEmail }
    );

    // Second cancellation attempt must be rejected
    await assert.rejects(
      async () => {
        await adminCancelSubscription(
          testUserId,
          { mode: 'IMMEDIATE', reason: 'Duplicate attempt to cancel again' },
          { adminId, adminEmail }
        );
      },
      /already been cancelled/i
    );

    await assert.rejects(
      async () => {
        await adminCancelSubscription(
          testUserId,
          { mode: 'END_OF_PERIOD', reason: 'Duplicate attempt to schedule period end' },
          { adminId, adminEmail }
        );
      },
      /already been cancelled/i
    );
  });

  await t.test('5. Duplicate period-end guard: prevents re-scheduling already scheduled subscriptions', async () => {
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '523456789012',
      paymentDate: '2026-10-30',
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    // Schedule cancellation at period end
    await adminCancelSubscription(
      testUserId,
      { mode: 'END_OF_PERIOD', reason: 'First schedule' },
      { adminId, adminEmail }
    );

    // Duplicate schedule attempt must be rejected
    await assert.rejects(
      async () => {
        await adminCancelSubscription(
          testUserId,
          { mode: 'END_OF_PERIOD', reason: 'Duplicate schedule' },
          { adminId, adminEmail }
        );
      },
      /already scheduled to cancel at the end/i
    );
  });

  await t.test('6. Payment records integrity: approved payments and UTR records remain APPROVED forever', async () => {
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '623456789012',
      paymentDate: '2026-10-30',
    });
    const approved = await approvePaymentRequest(adminId, adminEmail, reqId);
    assert.equal(approved.request.status, 'APPROVED');

    // Cancel subscription immediately
    await adminCancelSubscription(
      testUserId,
      { mode: 'IMMEDIATE', reason: 'Cancellation after payment' },
      { adminId, adminEmail }
    );

    // Admin payments listing must still report the payment as APPROVED with attached subscription state
    const adminPayments = await getAdminPaymentRequests('APPROVED');
    assert.ok(adminPayments.length > 0);
    const targetPayment = adminPayments.find((p) => p.utrNumber === '623456789012');
    assert.ok(targetPayment);
    assert.equal(targetPayment.status, 'APPROVED', 'Payment status must never be altered from APPROVED');
    assert.equal(targetPayment.subscription.status, 'canceled', 'Associated subscription state must reflect cancellation');
    assert.equal(targetPayment.subscription.cancellationMode, 'IMMEDIATE');
  });

  await t.test('7. Admin listing returns subscription metadata for active scheduled subscriptions', async () => {
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = req.id || req._id.toString();
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: '723456789012',
      paymentDate: '2026-10-30',
    });
    await approvePaymentRequest(adminId, adminEmail, reqId);

    await adminCancelSubscription(
      testUserId,
      { mode: 'END_OF_PERIOD', reason: 'User requested non-renewal' },
      { adminId, adminEmail }
    );

    const adminPayments = await getAdminPaymentRequests('APPROVED');
    const targetPayment = adminPayments.find((p) => p.utrNumber === '723456789012');
    assert.ok(targetPayment);
    assert.equal(targetPayment.subscription.status, 'active');
    assert.equal(targetPayment.subscription.cancelAtPeriodEnd, true);
    assert.equal(targetPayment.subscription.cancellationMode, 'END_OF_PERIOD');
    assert.equal(targetPayment.subscription.cancellationReason, 'User requested non-renewal');
  });
});
