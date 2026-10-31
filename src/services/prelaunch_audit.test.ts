process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMember,
  countHouseholdSeats,
  _resetMockMembers,
  SeatLimitExceededError,
  UnauthorizedMemberActionError,
} from './memberService';
import {
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  validateUploadEntitlement,
  simulateSubscriptionDev,
  updateSubscriptionStatus,
  _resetMockSubscriptions,
} from './subscriptionService';
import { canAccessTenantDocument } from '../utils/vaultLogic';
import { runRetentionScan } from './retentionService';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';

test('Kudumba Vault — Final Pre-Launch Verification Suite', async (t) => {
  const householdOwnerId = '507f1f77bcf86cd799439055';
  const otherHouseholdId = '507f1f77bcf86cd799439066';

  t.beforeEach(() => {
    _resetMockMembers();
    _resetMockSubscriptions();
  });

  await t.test('1. Household seat count & limit enforcement', async () => {
    // Add 5 members
    for (let i = 1; i <= 5; i++) {
      await createMember(householdOwnerId, {
        nameEn: `Family Member ${i}`,
        phone: `+91 98470 5555${i}`,
        role: i === 1 ? 'OWNER' : 'EDITOR',
      });
    }

    // Exactly 5 seats counted
    const seats = await countHouseholdSeats(householdOwnerId);
    assert.equal(seats, 5);

    // 6th member cannot be added on 5-seat plan
    await assert.rejects(
      async () => {
        await createMember(householdOwnerId, {
          nameEn: 'Excess Member 6',
          phone: '+91 98470 55556',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SeatLimitExceededError);
        assert.equal(err.maxSeats, 5);
        assert.equal(err.currentSeats, 5);
        return true;
      }
    );
  });

  await t.test('2. Permitted document access & cross-household isolation', () => {
    // Shared document within same household is accessible
    const canAccessShared = canAccessTenantDocument(
      { tenantId: householdOwnerId, userId: 'user-1' },
      { id: 'doc-1', tenantId: householdOwnerId, createdByUserId: 'user-2', visibility: 'SHARED' }
    );
    assert.equal(canAccessShared, true);

    // Private document in same household accessible only to creator
    const canAccessPrivateCreator = canAccessTenantDocument(
      { tenantId: householdOwnerId, userId: 'user-1' },
      { id: 'doc-2', tenantId: householdOwnerId, createdByUserId: 'user-1', visibility: 'PRIVATE' }
    );
    assert.equal(canAccessPrivateCreator, true);

    const canAccessPrivateOther = canAccessTenantDocument(
      { tenantId: householdOwnerId, userId: 'user-2' },
      { id: 'doc-3', tenantId: householdOwnerId, createdByUserId: 'user-1', visibility: 'PRIVATE' }
    );
    assert.equal(canAccessPrivateOther, false);

    // Cross-household access strictly forbidden
    const canAccessCrossHousehold = canAccessTenantDocument(
      { tenantId: otherHouseholdId, userId: 'user-3' },
      { id: 'doc-4', tenantId: householdOwnerId, createdByUserId: 'user-1', visibility: 'SHARED' }
    );
    assert.equal(canAccessCrossHousehold, false);
  });

  await t.test('3. Upgrading changes seat limit ONLY after verified subscription state', async () => {
    const sub = await getOrCreateUserSubscription(householdOwnerId);
    assert.equal(sub.planId, 'founding-free');

    const entitlementBefore = await evaluateUserEntitlement(householdOwnerId);
    assert.equal(entitlementBefore.maxFamilyMembers, 5);

    // Attempting to add a 6th member fails before upgrade
    for (let i = 1; i <= 5; i++) {
      await createMember(householdOwnerId, {
        nameEn: `Seated Member ${i}`,
        phone: `+91 98470 6666${i}`,
      });
    }
    await assert.rejects(
      async () => {
        await createMember(householdOwnerId, { nameEn: 'Member 6', phone: '+91 98470 66666' });
      },
      SeatLimitExceededError
    );

    // Upgrade state to active paid NRI Plus plan
    await updateSubscriptionStatus(householdOwnerId, 'active');
    const updatedSub = await getOrCreateUserSubscription(householdOwnerId);
    updatedSub.planId = 'nri-plus';
    updatedSub.planName = AUTHORITATIVE_PLANS['nri-plus'].nameEn;
    await updatedSub.save();

    const entitlementAfter = await evaluateUserEntitlement(householdOwnerId);
    assert.equal(entitlementAfter.maxFamilyMembers, 12, 'NRI Plus plan must grant 12 seats');

    // Now adding 6th member succeeds
    const m6 = await createMember(householdOwnerId, {
      nameEn: 'Member 6',
      phone: '+91 98470 66666',
    });
    assert.ok(m6._id);
    assert.equal(await countHouseholdSeats(householdOwnerId), 6);
  });

  await t.test('4. Subscription lifecycle: 3-day trial, timestamps, 48h grace & upload boundaries', async () => {
    const freshUserId = '507f1f77bcf86cd799439077';
    const sub = await getOrCreateUserSubscription(freshUserId, 'prelaunch.test@kudumba.in');

    assert.equal(sub.status, 'trialing');
    assert.equal(sub.planId, 'founding-free');

    const durationDays = Math.round((sub.trialEnd.getTime() - sub.trialStart.getTime()) / (1000 * 60 * 60 * 24));
    assert.equal(durationDays, 3);

    const graceHours = Math.round((sub.gracePeriodEnd.getTime() - sub.trialEnd.getTime()) / (1000 * 60 * 60));
    assert.equal(graceHours, 48);

    // Timestamps do not reset on subsequent lookups
    const subRefetched = await getOrCreateUserSubscription(freshUserId);
    assert.equal(subRefetched.trialEnd.getTime(), sub.trialEnd.getTime());
    assert.equal(subRefetched.gracePeriodEnd.getTime(), sub.gracePeriodEnd.getTime());

    // Active trial permits uploads
    const uploadAllowed = await validateUploadEntitlement(freshUserId, 1024 * 1024);
    assert.equal(uploadAllowed.allowed, true);

    // Expire trial -> upload rejected, download/view preserved
    await simulateSubscriptionDev(freshUserId, 'EXPIRE_TRIAL');
    const entitlementExpired = await evaluateUserEntitlement(freshUserId);
    assert.equal(entitlementExpired.status, 'expired');
    assert.equal(entitlementExpired.canUpload, false);
    assert.equal(entitlementExpired.canDownloadOrView, true);

    const uploadRejected = await validateUploadEntitlement(freshUserId, 1024 * 1024);
    assert.equal(uploadRejected.allowed, false);
  });

  await t.test('5. Pending or failed payment never grants paid entitlements', async () => {
    const billingUserId = '507f1f77bcf86cd799439088';
    await getOrCreateUserSubscription(billingUserId);

    // Mark status as pending_payment
    await updateSubscriptionStatus(billingUserId, 'pending_payment');
    const entPending = await evaluateUserEntitlement(billingUserId);
    assert.equal(entPending.canUpload, false, 'pending_payment must not grant uploads');

    // Mark status as past_due
    await updateSubscriptionStatus(billingUserId, 'past_due');
    const entPastDue = await evaluateUserEntitlement(billingUserId);
    assert.equal(entPastDue.canUpload, false, 'past_due must not grant uploads');

    // Mark status as canceled
    await updateSubscriptionStatus(billingUserId, 'canceled');
    const entCanceled = await evaluateUserEntitlement(billingUserId);
    assert.equal(entCanceled.canUpload, false, 'canceled must not grant uploads');
    assert.equal(entCanceled.canDownloadOrView, true, 'existing docs must remain accessible');
  });

  await t.test('6. Production isolation of development subscription simulation', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await assert.rejects(
        async () => {
          await simulateSubscriptionDev(householdOwnerId, 'EXPIRE_TRIAL');
        },
        /Subscription simulator is strictly forbidden in production/
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  await t.test('7. Retention scan runs in dry-run mode by default without deleting documents', async () => {
    const scanResult = await runRetentionScan();
    assert.equal(scanResult.dryRun, true, 'Retention scan must default to dryRun: true');
    assert.equal(scanResult.documentsDeleted, 0, 'Dry run must never delete documents');
  });
});
