import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

import {
  evaluateUserEntitlement,
  validateUploadEntitlement,
  getOrCreateUserSubscription,
  processExpiredTrialsBatch,
  _resetMockSubscriptions,
  _getMockSubscription,
} from './subscriptionService';
import { runTrialExpirationCycle } from './scheduler';
import { setMailerTransporterForTesting } from './mailer';
import { AUTHORITATIVE_PLANS, DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_PERIOD_HOURS } from '../config/planConfig';
import {
  uploadAndCreateDocument,
  clearMockDocStore,
  getUserStorageUsage,
} from './documentService';
import {
  createMember,
  _resetMockMembers,
  SeatLimitExceededError,
  listMembers,
} from './memberService';
import { setMockUserSettings, clearMockUserSettingsStore } from '../models/UserSettings';

describe('Authoritative Free Trial Expiration, Entitlement Transition & Cron Audit', () => {
  const userAlpha = '507f1f77bcf86cd799439101';
  const userBeta = '507f1f77bcf86cd799439102';
  const userGamma = '507f1f77bcf86cd799439103';
  const userPaid = '507f1f77bcf86cd799439104';

  const makePdfBuffer = (seed: number) =>
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, seed & 0xff, 0x0a]);

  beforeEach(() => {
    _resetMockSubscriptions();
    clearMockDocStore();
    _resetMockMembers();
    clearMockUserSettingsStore();
  });

  it('Scenario 1: Active trial calculation reflects exact 3-day duration and full access', async () => {
    const sub = await getOrCreateUserSubscription(userAlpha, 'alpha@kudumba.test');
    assert.strictEqual(sub.status, 'trialing');

    const entitlement = await evaluateUserEntitlement(userAlpha);

    assert.strictEqual(entitlement.isTrialing, true);
    assert.strictEqual(entitlement.isActiveOrTrialing, true);
    assert.strictEqual(entitlement.trialExpired, false);
    assert.strictEqual(entitlement.daysRemainingInTrial, DEFAULT_TRIAL_DAYS);
    assert.ok(entitlement.hoursRemainingInTrial && entitlement.hoursRemainingInTrial > 48);
    assert.strictEqual(entitlement.canUpload, true);
    assert.strictEqual(entitlement.canDownloadOrView, true);
    assert.ok(entitlement.trialStart, 'trialStart must be persisted');
    assert.ok(entitlement.trialEnd, 'trialEnd must be persisted');
  });

  it('Scenario 2: Trial with 1 day remaining accurately reports hours remaining (<= 24h)', async () => {
    const sub = await getOrCreateUserSubscription(userAlpha, 'alpha@kudumba.test');
    const now = Date.now();
    // Simulate 18 hours remaining
    sub.trialEnd = new Date(now + 18 * 60 * 60 * 1000);
    await sub.save();

    const entitlement = await evaluateUserEntitlement(userAlpha);

    assert.strictEqual(entitlement.isTrialing, true);
    assert.strictEqual(entitlement.trialExpired, false);
    assert.strictEqual(entitlement.daysRemainingInTrial, 1);
    assert.strictEqual(entitlement.hoursRemainingInTrial, 18);
  });

  it('Scenario 3: Trial expiring at exact timestamp automatically transitions status to expired server-side', async () => {
    const sub = await getOrCreateUserSubscription(userAlpha, 'alpha@kudumba.test');
    const now = Date.now();
    // Set trialEnd to exactly 1ms ago
    sub.trialEnd = new Date(now - 1);
    await sub.save();

    const entitlement = await evaluateUserEntitlement(userAlpha);

    assert.strictEqual(entitlement.status, 'expired');
    assert.strictEqual(entitlement.isTrialing, false);
    assert.strictEqual(entitlement.trialExpired, true);
    assert.strictEqual(entitlement.isActiveOrTrialing, false);
    assert.strictEqual(entitlement.daysRemainingInTrial, 0);
    assert.strictEqual(entitlement.hoursRemainingInTrial, 0);
    assert.strictEqual(entitlement.inGracePeriod, true);
  });

  it('Scenario 4: Expired trial without payment blocks uploads and preserves read/download access', async () => {
    const sub = await getOrCreateUserSubscription(userAlpha, 'alpha@kudumba.test');
    sub.trialEnd = new Date(Date.now() - 10000);
    await sub.save();

    // Entitlement verification
    const entitlement = await evaluateUserEntitlement(userAlpha);
    assert.strictEqual(entitlement.canUpload, false, 'Expired trial must block uploads');
    assert.strictEqual(entitlement.canDownloadOrView, true, 'Expired trial must preserve download access');

    // Upload validation verification
    const uploadCheck = await validateUploadEntitlement(userAlpha, 1024);
    assert.strictEqual(uploadCheck.allowed, false);
    assert.ok(
      uploadCheck.reason?.toLowerCase().includes('trial has expired'),
      'Must provide actionable trial expired message'
    );
  });

  it('Scenario 5: Expired trial transitions account to authoritative Founding Free plan limits', async () => {
    const sub = await getOrCreateUserSubscription(userAlpha, 'alpha@kudumba.test');
    sub.trialEnd = new Date(Date.now() - 60000);
    await sub.save();

    const entitlement = await evaluateUserEntitlement(userAlpha);
    const freePlan = AUTHORITATIVE_PLANS['founding-free'];

    assert.strictEqual(entitlement.planId, 'founding-free');
    assert.strictEqual(entitlement.planName, freePlan.nameEn);
    assert.strictEqual(entitlement.storageQuotaBytes, freePlan.storageQuotaBytes);
    assert.strictEqual(entitlement.storageQuotaBytes, 3 * 1024 * 1024 * 1024); // 3 GiB
    assert.strictEqual(entitlement.maxFamilyMembers, freePlan.maxFamilyMembers);
    assert.strictEqual(entitlement.maxFamilyMembers, 5); // 5 members
    assert.strictEqual(entitlement.maxDocuments, freePlan.maxDocuments);
    assert.strictEqual(entitlement.maxDocuments, 3); // 3 documents limit
    assert.strictEqual(entitlement.maxFileSizeBytes, freePlan.maxFileSizeBytes);
    assert.strictEqual(entitlement.maxFileSizeBytes, 25 * 1024 * 1024); // 25 MB
  });

  it('Scenario 6: Active paid subscriptions remain untouched by trial expiration jobs', async () => {
    // Setup active paid subscriber
    const paidSub = await getOrCreateUserSubscription(userPaid, 'paid@kudumba.test');
    paidSub.status = 'active';
    paidSub.planId = 'nri-plus';
    paidSub.planName = AUTHORITATIVE_PLANS['nri-plus'].nameEn;
    paidSub.maxFamilyMembers = AUTHORITATIVE_PLANS['nri-plus'].maxFamilyMembers;
    paidSub.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // Even if historical trialEnd was in the past:
    paidSub.trialEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await paidSub.save();

    // Run trial expiration batch
    const batchResult = await processExpiredTrialsBatch();

    // Verify paid subscriber was not expired
    const freshPaidSub = _getMockSubscription(userPaid);
    assert.strictEqual(freshPaidSub.status, 'active');
    assert.strictEqual(freshPaidSub.planId, 'nri-plus');

    const entitlement = await evaluateUserEntitlement(userPaid);
    assert.strictEqual(entitlement.status, 'active');
    assert.strictEqual(entitlement.planId, 'nri-plus');
    assert.strictEqual(entitlement.isActiveOrTrialing, true);
    assert.strictEqual(entitlement.canUpload, true);
  });

  it('Scenario 7: Repeated cron execution is strictly idempotent and sends notifications only once', async () => {
    const sub = await getOrCreateUserSubscription(userBeta, 'beta@kudumba.test');
    sub.trialEnd = new Date(Date.now() - 5000);
    await sub.save();

    // Run 1: Should expire and notify
    const run1 = await processExpiredTrialsBatch();
    assert.strictEqual(run1.expiredCount, 1);
    assert.strictEqual(run1.expirationsNotified, 1);

    const subAfterRun1 = _getMockSubscription(userBeta);
    assert.strictEqual(subAfterRun1.status, 'expired');
    assert.ok(subAfterRun1.metadata?.trialExpiryNotifiedAt);

    // Run 2: Immediately re-run; must be idempotent (0 newly expired, 0 newly notified)
    const run2 = await processExpiredTrialsBatch();
    assert.strictEqual(run2.expiredCount, 0);
    assert.strictEqual(run2.expirationsNotified, 0);

    // Run 3: Another re-run; remains idempotent
    const run3 = await processExpiredTrialsBatch();
    assert.strictEqual(run3.expiredCount, 0);
    assert.strictEqual(run3.expirationsNotified, 0);
  });

  it('Scenario 8: Paid features and quota expansion are strictly blocked after trial expiration', async () => {
    const sub = await getOrCreateUserSubscription(userGamma, 'gamma@kudumba.test');
    // Pre-populate 5 family members (the Free limit)
    for (let i = 1; i <= 5; i++) {
      await createMember(
        userGamma,
        {
          nameEn: `Member ${i}`,
          relationEn: 'Child',
        },
        { requesterId: userGamma, requesterRole: 'USER' }
      );
    }
    const membersBefore = await listMembers(userGamma);
    assert.strictEqual(membersBefore.length, 5);

    // Expire trial
    sub.trialEnd = new Date(Date.now() - 1000);
    await sub.save();

    // 1. Upload attempts blocked
    const uploadRes = await validateUploadEntitlement(userGamma, 2048);
    assert.strictEqual(uploadRes.allowed, false);

    // 2. Adding a 6th family member blocked by SeatLimitExceededError
    await assert.rejects(
      async () => {
        await createMember(
          userGamma,
          {
            nameEn: 'Member 6',
            relationEn: 'Other',
          },
          { requesterId: userGamma, requesterRole: 'USER' }
        );
      },
      (err: any) => {
        assert.ok(err instanceof SeatLimitExceededError);
        assert.strictEqual(err.maxSeats, 5);
        return true;
      }
    );
  });

  it('Scenario 9: Existing documents remain intact and accessible after trial expiration', async () => {
    const sub = await getOrCreateUserSubscription(userAlpha, 'alpha@kudumba.test');

    // Upload 2 documents during the active trial
    const doc1 = await uploadAndCreateDocument(
      userAlpha,
      {
        buffer: makePdfBuffer(1),
        originalname: 'aadhaar.pdf',
        mimetype: 'application/pdf',
        size: 50000,
      },
      { title: 'Aadhaar Card', category: 'IDENTITY' }
    );
    assert.ok(doc1?.id);

    const doc2 = await uploadAndCreateDocument(
      userAlpha,
      {
        buffer: makePdfBuffer(2),
        originalname: 'passport.pdf',
        mimetype: 'application/pdf',
        size: 80000,
      },
      { title: 'Passport', category: 'PASSPORT' }
    );
    assert.ok(doc2?.id);

    // Now expire the trial
    sub.trialEnd = new Date(Date.now() - 10000);
    await sub.save();

    // Authoritative check: storage usage and documents intact
    const usage = await getUserStorageUsage(userAlpha);
    assert.strictEqual(usage.documentCount, 2, 'Existing documents must remain intact');
    assert.strictEqual(usage.usedBytes, 130000, 'Used bytes must accurately reflect stored files');

    const entitlement = await evaluateUserEntitlement(userAlpha);
    assert.strictEqual(entitlement.canDownloadOrView, true, 'User retains view and download access');
  });

  it('Scenario 10: Server restart catch-up detects and processes expired trials immediately', async () => {
    // Simulate trial that expired while server was offline / restarting
    const offlineUser = '507f1f77bcf86cd799439199';
    const sub = await getOrCreateUserSubscription(offlineUser, 'offline@kudumba.test');
    // Expired 6 hours ago during downtime
    sub.trialEnd = new Date(Date.now() - 6 * 60 * 60 * 1000);
    sub.status = 'trialing'; // Was not processed yet because server was stopped
    await sub.save();

    // Trigger startup catch-up cycle
    const catchupResult = await runTrialExpirationCycle();

    assert.ok(catchupResult.expiredCount >= 1, 'Catch-up scan must expire offline trials');

    const freshSub = _getMockSubscription(offlineUser);
    assert.strictEqual(freshSub.status, 'expired', 'Subscription must be transitioned to expired');
    assert.strictEqual(freshSub.planId, 'founding-free');
    assert.strictEqual(freshSub.retentionStatus, 'in_grace_period');
  });

  it('Respects notification preference reminderExpired when user disables alerts', async () => {
    const silentUser = '507f1f77bcf86cd799439200';
    const sub = await getOrCreateUserSubscription(silentUser, 'silent@kudumba.test');
    sub.trialEnd = new Date(Date.now() - 5000);
    await sub.save();

    // User disabled expired reminders
    setMockUserSettings(silentUser, {
      userId: silentUser,
      notificationPreferences: {
        reminder60Days: true,
        reminder30Days: true,
        reminder7Days: true,
        reminderExpired: false, // Disabled!
        weeklyDigest: false,
      },
    });

    const result = await processExpiredTrialsBatch();
    assert.strictEqual(result.expiredCount, 1, 'Status still transitions to expired');
    assert.strictEqual(result.expirationsNotified, 0, 'Email must be suppressed when reminderExpired is false');
  });
});
