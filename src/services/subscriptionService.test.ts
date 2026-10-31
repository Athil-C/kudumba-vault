process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  validateUploadEntitlement,
  simulateSubscriptionDev,
  reserveQuota,
  releaseQuotaReservation,
  confirmQuotaReservation,
  getReservedBytes,
  isValidSubscriptionTransition,
  updateSubscriptionStatus,
  _resetMockSubscriptions,
} from './subscriptionService';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';

test('Kudumba Vault — Development SaaS Subscription & Free Trial Engine', async (t) => {
  const testUserId = '507f1f77bcf86cd799439099';

  t.beforeEach(() => {
    _resetMockSubscriptions();
  });

  await t.test('1. Verified signup starts one eligible 3-day trial idempotently', async () => {
    const sub = await getOrCreateUserSubscription(testUserId);
    assert.equal(sub.status, 'trialing');
    assert.equal(sub.planId, 'founding-free');
    assert.ok(sub.trialStart, 'Must record trialStart timestamp');
    assert.ok(sub.trialEnd, 'Must record trialEnd timestamp');
    assert.ok(sub.gracePeriodEnd, 'Must record gracePeriodEnd timestamp');

    // Expected duration is exactly 3 days
    const durationDays = Math.round((sub.trialEnd.getTime() - sub.trialStart.getTime()) / (24 * 60 * 60 * 1000));
    assert.equal(durationDays, 3, 'Trial duration must be exactly 3 days');

    // Expected grace period is trialEnd + 48 hours
    const graceHours = Math.round((sub.gracePeriodEnd.getTime() - sub.trialEnd.getTime()) / (60 * 60 * 1000));
    assert.equal(graceHours, 48, 'Grace period must be exactly 48 hours');

    // Repeated call should preserve the exact same subscription
    const subRepeat = await getOrCreateUserSubscription(testUserId);
    assert.equal(subRepeat.trialEnd.getTime(), sub.trialEnd.getTime(), 'Trial end date must not reset on re-fetch');
  });

  await t.test('2. Trial status and days remaining are calculated accurately on the backend', async () => {
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.status, 'trialing');
    assert.equal(entitlement.isTrialing, true);
    assert.equal(entitlement.trialExpired, false);
    assert.equal(entitlement.canUpload, true);
    assert.ok(entitlement.daysRemainingInTrial >= 2 && entitlement.daysRemainingInTrial <= 3);
    assert.equal(entitlement.storageQuotaBytes, 3 * 1024 * 1024 * 1024);
  });

  await t.test('3. Free trial expiration correctly revokes upload rights while preserving document access', async () => {
    // Manually expire trial via simulator
    await simulateSubscriptionDev(testUserId, 'EXPIRE_TRIAL');
    const entitlement = await evaluateUserEntitlement(testUserId);

    assert.equal(entitlement.status, 'expired');
    assert.equal(entitlement.isTrialing, false);
    assert.equal(entitlement.trialExpired, true);
    assert.equal(entitlement.canUpload, false, 'Expired trial must block new uploads');
    assert.equal(entitlement.canDownloadOrView, true, 'Expired trial must never delete or block existing documents');

    // Validate upload entitlement check rejects upload
    const uploadCheck = await validateUploadEntitlement(testUserId, 1024);
    assert.equal(uploadCheck.allowed, false);
    assert.match(uploadCheck.reason || '', /trial has expired/i);
  });

  await t.test('4. Backend rejects uploads exceeding plan storage quota', async () => {
    // Reset to fresh active trial
    await simulateSubscriptionDev(testUserId, 'START_TRIAL');

    // Attempt to upload file exceeding quota (e.g. 4 GiB when quota is 3 GiB)
    const largeFileSizeBytes = 4 * 1024 * 1024 * 1024;
    const check = await validateUploadEntitlement(testUserId, largeFileSizeBytes);

    assert.equal(check.allowed, false);
    assert.match(check.reason || '', /exceeds the plan limit|quota exceeded/i);
  });

  await t.test('5. Backend rejects files exceeding max file size limit (25 MB)', async () => {
    await simulateSubscriptionDev(testUserId, 'START_TRIAL');

    const oversizedFile = 30 * 1024 * 1024; // 30 MB
    const check = await validateUploadEntitlement(testUserId, oversizedFile);

    assert.equal(check.allowed, false);
    assert.match(check.reason || '', /File size exceeds the plan limit/i);
  });

  await t.test('6. Development simulator marks subscription as simulated and never as real payment', async () => {
    const upgraded = await simulateSubscriptionDev(testUserId, 'SIMULATE_UPGRADE');

    assert.equal(upgraded.status, 'active');
    assert.equal(upgraded.planId, 'nri-plus');
    assert.equal(upgraded.isSimulatedDev, true, 'Must clearly flag as development-only simulation');
    assert.equal(upgraded.storageQuotaBytes, 15 * 1024 * 1024 * 1024);
  });

  await t.test('7. Simulator is strictly blocked in production environment', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await assert.rejects(
      async () => {
        await simulateSubscriptionDev(testUserId, 'START_TRIAL');
      },
      /forbidden in production/i,
      'Production must throw error when simulator is called'
    );

    process.env.NODE_ENV = prevEnv;
  });

  await t.test('8. Concurrent uploads atomically reserve quota and prevent oversubscription', async () => {
    await simulateSubscriptionDev(testUserId, 'START_TRIAL');
    const planQuotaBytes = 3 * 1024 * 1024 * 1024; // 3 GiB

    // Assume user is trying to upload two 20 MB files in parallel
    const file1Bytes = 20 * 1024 * 1024;
    const file2Bytes = 20 * 1024 * 1024;

    const check1 = await validateUploadEntitlement(testUserId, file1Bytes);
    assert.equal(check1.allowed, true);
    assert.ok(check1.reservationId, 'Must return reservationId');

    // Quota reservation should now reflect in getReservedBytes
    assert.equal(getReservedBytes(testUserId), file1Bytes);

    const check2 = await validateUploadEntitlement(testUserId, file2Bytes);
    assert.equal(check2.allowed, true);
    assert.ok(check2.reservationId);
    assert.equal(getReservedBytes(testUserId), file1Bytes + file2Bytes);

    // Release reservation 1 on upload failure / abort
    releaseQuotaReservation(check1.reservationId!);
    assert.equal(getReservedBytes(testUserId), file2Bytes);

    // Confirm reservation 2 on upload success
    confirmQuotaReservation(check2.reservationId!);
    assert.equal(getReservedBytes(testUserId), 0);
  });

  await t.test('9. Simultaneous uploads exceeding available quota are safely rejected', async () => {
    await simulateSubscriptionDev(testUserId, 'START_TRIAL');
    const maxAllowedBytes = 24 * 1024 * 1024; // 24 MB (under 25 MB limit)

    // Fill quota virtually using reservation right up to the limit
    const totalQuota = 3 * 1024 * 1024 * 1024;
    const reserveId = reserveQuota(testUserId, totalQuota - 10 * 1024 * 1024); // Leave only 10 MB headroom

    // Now try to upload a 20 MB file
    const check = await validateUploadEntitlement(testUserId, 20 * 1024 * 1024);
    assert.equal(check.allowed, false);
    assert.match(check.reason || '', /Storage quota exceeded/i);

    // Clean up
    releaseQuotaReservation(reserveId);
  });

  await t.test('10. Subscription state transition validation enforces strict rules', async () => {
    // Valid transitions
    assert.equal(isValidSubscriptionTransition('trialing', 'active'), true);
    assert.equal(isValidSubscriptionTransition('trialing', 'expired'), true);
    assert.equal(isValidSubscriptionTransition('trialing', 'canceled'), true);
    assert.equal(isValidSubscriptionTransition('active', 'past_due'), true);
    assert.equal(isValidSubscriptionTransition('active', 'canceled'), true);
    assert.equal(isValidSubscriptionTransition('canceled', 'active'), true);

    // Invalid transitions
    assert.equal(isValidSubscriptionTransition('expired', 'past_due'), false);
    assert.equal(isValidSubscriptionTransition('canceled', 'past_due'), false);

    // Update subscription with valid transition
    await simulateSubscriptionDev(testUserId, 'START_TRIAL');
    const updated = await updateSubscriptionStatus(testUserId, 'active');
    assert.equal(updated.status, 'active');

    // Attempt invalid transition
    await updateSubscriptionStatus(testUserId, 'expired');
    await assert.rejects(
      async () => {
        await updateSubscriptionStatus(testUserId, 'past_due');
      },
      /Invalid subscription transition/i
    );
  });

  await t.test('11. Simulated entitlements never grant active production upload rights', async () => {
    // Sub marked as isSimulatedDev
    await simulateSubscriptionDev(testUserId, 'SIMULATE_UPGRADE');

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.canUpload, false, 'Simulated upgrade must never grant upload access in production');

    process.env.NODE_ENV = prevEnv;
  });
});
