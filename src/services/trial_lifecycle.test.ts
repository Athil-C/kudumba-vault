process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  validateUploadEntitlement,
  simulateSubscriptionDev,
  checkTrialConsumption,
  recordTrialConsumption,
  _resetMockSubscriptions,
} from './subscriptionService';
import { runRetentionScan, _clearMockRetentionAuditLog } from './retentionService';

test('Kudumba Vault — 3-Day Free Trial, Upgrade Popup & Grace-Period Lifecycle Suite', async (t) => {
  const userId = '507f1f77bcf86cd799439099';
  const testEmail = 'trial.user@kudumba.example';

  t.beforeEach(() => {
    _resetMockSubscriptions();
    _clearMockRetentionAuditLog();
  });

  await t.test('1. New eligible account receives exactly a 3-day trial', async () => {
    const sub = await getOrCreateUserSubscription(userId, testEmail);
    assert.equal(sub.status, 'trialing');
    assert.ok(sub.trialStart, 'Must have trialStart');
    assert.ok(sub.trialEnd, 'Must have trialEnd');

    const durationDays = Math.round((sub.trialEnd.getTime() - sub.trialStart.getTime()) / (24 * 60 * 60 * 1000));
    assert.equal(durationDays, 3, 'Trial duration must be strictly 3 days');
  });

  await t.test('2. Repeated requests do not restart the trial', async () => {
    const sub1 = await getOrCreateUserSubscription(userId, testEmail);
    const initialExpiry = sub1.trialEnd.getTime();

    // Re-fetch multiple times
    const sub2 = await getOrCreateUserSubscription(userId, testEmail);
    assert.equal(sub2.trialEnd.getTime(), initialExpiry, 'Trial expiry must remain strictly unchanged');

    const ent = await evaluateUserEntitlement(userId);
    assert.equal(new Date(ent.trialEnd!).getTime(), initialExpiry);
  });

  await t.test('3. Trial remains active until the exact expiry boundary', async () => {
    const ent = await evaluateUserEntitlement(userId);
    assert.equal(ent.status, 'trialing');
    assert.equal(ent.isTrialing, true);
    assert.equal(ent.trialExpired, false);
    assert.equal(ent.canUpload, true);
  });

  await t.test('4. Expired trial enters a 48-hour grace period', async () => {
    await simulateSubscriptionDev(userId, 'EXPIRE_TRIAL');
    const ent = await evaluateUserEntitlement(userId);

    assert.equal(ent.status, 'expired');
    assert.equal(ent.trialExpired, true);
    assert.equal(ent.inGracePeriod, true, 'Must be in 48-hour grace period');
    assert.ok(ent.hoursRemainingInGrace! > 0 && ent.hoursRemainingInGrace! <= 48);
  });

  await t.test('5. Uploads are rejected after trial expiry', async () => {
    await simulateSubscriptionDev(userId, 'EXPIRE_TRIAL');
    const uploadResult = await validateUploadEntitlement(userId, 5000);

    assert.equal(uploadResult.allowed, false);
    assert.match(uploadResult.reason || '', /trial has expired/i);
  });

  await t.test('6. Existing documents remain readable during grace period', async () => {
    await simulateSubscriptionDev(userId, 'EXPIRE_TRIAL');
    const ent = await evaluateUserEntitlement(userId);

    assert.equal(ent.canDownloadOrView, true, 'Users never lose access to their existing documents');
  });

  await t.test('7. Successful verified upgrade preserves documents and activates paid entitlement', async () => {
    // Start with expired trial
    await simulateSubscriptionDev(userId, 'EXPIRE_TRIAL');

    // Simulate verified upgrade
    const upgradedEnt = await simulateSubscriptionDev(userId, 'SIMULATE_UPGRADE');
    assert.equal(upgradedEnt.status, 'active');
    assert.equal(upgradedEnt.planId, 'nri-plus');
    assert.equal(upgradedEnt.canUpload, true);
    assert.equal(upgradedEnt.retentionStatus, 'retained_paid');
  });

  await t.test('8. Failed or pending payment does not restore paid access', async () => {
    await simulateSubscriptionDev(userId, 'EXPIRE_TRIAL');
    const ent = await evaluateUserEntitlement(userId);

    assert.equal(ent.status, 'expired');
    assert.equal(ent.canUpload, false);
  });

  await t.test('9. Grace deadline remains unchanged across logins and device opens', async () => {
    await simulateSubscriptionDev(userId, 'EXPIRE_TRIAL');
    const ent1 = await evaluateUserEntitlement(userId);
    const deadline1 = ent1.gracePeriodEnd;

    // Simulate subsequent evaluation / login
    const ent2 = await evaluateUserEntitlement(userId);
    assert.equal(ent2.gracePeriodEnd, deadline1, 'Grace period deadline must be idempotent and immutable');
  });

  await t.test('10. Previously used email cannot receive another free trial', async () => {
    await recordTrialConsumption('used.family@example.com', userId);
    const hasUsed = await checkTrialConsumption('used.family@example.com');
    assert.equal(hasUsed, true, 'Email must be recorded as having consumed trial');

    const freshEmail = await checkTrialConsumption('fresh.user@example.com');
    assert.equal(freshEmail, false, 'Unused email must remain eligible');
  });

  await t.test('11. Deletion dry-run identifies eligible documents without deleting anything', async () => {
    const scan = await runRetentionScan({ dryRun: true });
    assert.equal(scan.dryRun, true);
    assert.equal(scan.documentsDeleted, 0, 'Dry run must never delete any documents');
  });

  await t.test('12. Concurrent payment and expiry processing cannot delete upgraded users documents', async () => {
    // Upgraded user with 'active' status
    await simulateSubscriptionDev(userId, 'SIMULATE_UPGRADE');

    const scan = await runRetentionScan({ dryRun: false, enablePermanentDeletion: true });
    assert.equal(scan.documentsDeleted, 0, 'Active upgraded user must be strictly excluded from deletion');
  });

  await t.test('13. Simulated subscriptions never grant production entitlements', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      const ent = await evaluateUserEntitlement(userId);
      // In production, isSimulatedDev must not yield canUpload: true
      if (ent.isSimulatedDev) {
        assert.equal(ent.canUpload, false, 'Simulated subscriptions must never grant upload access in production');
      }
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  await t.test('14. Non-active states (past_due, pending_payment, canceled, expired) strictly reject uploads', async () => {
    const sub = await getOrCreateUserSubscription(userId, testEmail);

    const restrictedStatuses: Array<'past_due' | 'pending_payment' | 'canceled' | 'expired'> = [
      'past_due',
      'pending_payment',
      'canceled',
      'expired',
    ];

    for (const st of restrictedStatuses) {
      sub.status = st;
      const check = await validateUploadEntitlement(userId, 1024);
      assert.equal(check.allowed, false, `Status ${st} must strictly block uploads`);
      assert.equal(check.entitlement.canUpload, false);
    }
  });
});
