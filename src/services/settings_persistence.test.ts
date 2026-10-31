process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserSettings,
  updateProfileSettings,
  updateNotificationSettings,
  updateSecuritySettings,
} from './settingsService';
import { clearMockUserSettingsStore, setMockUserSettings } from '../models/UserSettings';
import { clearMockSbUserStore, User } from '../models/User';
import { checkAndDispatchDocumentExpiryNotification } from './expiryDetector';
import { NotificationTracker } from './notificationTracker';

describe('Settings Dashboard Dynamic Persistence & Security Test Suite', () => {
  const testUserId = '654321654321654321654321';
  const testEmail = 'athilchalil@gmail.com';

  beforeEach(() => {
    clearMockUserSettingsStore();
    clearMockSbUserStore();
    // Seed test user in mock store
    setMockUserSettings(testUserId, {
      user: {
        _id: testUserId,
        id: testUserId,
        name: 'Athil Chalil',
        fullName: 'Athil Chalil',
        familyName: 'Chalil Kudumbam',
        email: testEmail,
        role: 'USER',
        status: 'ACTIVE',
        preferredLang: 'ml',
        dateOfBirth: '1995-05-15',
      },
      settings: {
        userId: testUserId,
        householdId: 'Chalil Kudumbam',
        notificationPreferences: {
          reminder60Days: true,
          reminder30Days: true,
          reminder7Days: true,
          reminderExpired: true,
          weeklyDigest: true,
        },
        securityPreferences: {
          sessionTimeoutDays: 7,
          inactivityLockEnabled: true,
        },
      },
    });
  });

  test('1. getUserSettings loads profile and notification preferences dynamically', async () => {
    const settings = await getUserSettings(testUserId);
    assert.ok(settings.profile);
    assert.strictEqual(settings.profile.fullName, 'Athil Chalil');
    assert.strictEqual(settings.profile.familyName, 'Chalil Kudumbam');
    assert.strictEqual(settings.profile.email, testEmail);
    assert.strictEqual(settings.profile.hasDateOfBirth, true);
    // Strict requirement: Never leak raw date of birth in settings responses
    assert.strictEqual(settings.profile.dateOfBirthMasked, '••••-••-••');
    assert.strictEqual((settings.profile as any).dateOfBirth, undefined);

    assert.ok(settings.notificationPreferences);
    assert.strictEqual(settings.notificationPreferences.reminder60Days, true);
    assert.strictEqual(settings.notificationPreferences.reminder30Days, true);
    assert.strictEqual(settings.notificationPreferences.reminder7Days, true);
    assert.strictEqual(settings.notificationPreferences.reminderExpired, true);
    assert.strictEqual(settings.notificationPreferences.weeklyDigest, true);
  });

  test('2. updateProfileSettings validates and persists household name and full name', async () => {
    const updated = await updateProfileSettings(testUserId, {
      fullName: 'Athil C.',
      householdName: 'Malabar Heritage Kudumbam',
    });

    assert.strictEqual(updated.fullName, 'Athil C.');
    assert.strictEqual(updated.familyName, 'Malabar Heritage Kudumbam');

    // Verify subsequent fetch returns the updated fields
    const fresh = await getUserSettings(testUserId);
    assert.strictEqual(fresh.profile.fullName, 'Athil C.');
    assert.strictEqual(fresh.profile.familyName, 'Malabar Heritage Kudumbam');
  });

  test('3. updateProfileSettings validates full name constraints', async () => {
    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { fullName: 'A' });
      },
      { message: 'Full name must be at least 2 characters.' }
    );

    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { fullName: 'A'.repeat(121) });
      },
      { message: 'Full name cannot exceed 120 characters.' }
    );
  });

  test('4. updateProfileSettings validates and safely normalizes Date of Birth', async () => {
    // Valid DOB update
    const updated = await updateProfileSettings(testUserId, {
      dateOfBirth: '1992-11-20',
    });
    assert.strictEqual(updated.hasDateOfBirth, true);
    assert.strictEqual(updated.dateOfBirthMasked, '••••-••-••');

    // Future date must be rejected
    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { dateOfBirth: '2099-01-01' });
      },
      (err: any) => err.message.includes('future') || err.message.includes('Invalid')
    );

    // Invalid format must be rejected
    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { dateOfBirth: 'not-a-date' });
      },
      (err: any) => err.message.includes('YYYY-MM-DD') || err.message.includes('Invalid')
    );
  });

  test('5. updateNotificationSettings toggles milestone preferences and persists them', async () => {
    // Toggle 60-day reminder off
    const step1 = await updateNotificationSettings(testUserId, { reminder60Days: false });
    assert.strictEqual(step1.reminder60Days, false);
    assert.strictEqual(step1.reminder30Days, true);

    // Toggle weekly digest off
    const step2 = await updateNotificationSettings(testUserId, { weeklyDigest: false });
    assert.strictEqual(step2.reminder60Days, false);
    assert.strictEqual(step2.weeklyDigest, false);

    // Re-fetch to ensure permanent persistence
    const fresh = await getUserSettings(testUserId);
    assert.strictEqual(fresh.notificationPreferences.reminder60Days, false);
    assert.strictEqual(fresh.notificationPreferences.reminder30Days, true);
    assert.strictEqual(fresh.notificationPreferences.reminder7Days, true);
    assert.strictEqual(fresh.notificationPreferences.weeklyDigest, false);
  });

  test('6. updateNotificationSettings rejects non-boolean inputs safely', async () => {
    await assert.rejects(
      async () => {
        await updateNotificationSettings(testUserId, { reminder30Days: 'yes' as any });
      },
      { message: 'Notification preference reminder30Days must be a boolean.' }
    );
  });

  test('7. updateSecuritySettings validates and persists session preferences', async () => {
    const updated = await updateSecuritySettings(testUserId, {
      sessionTimeoutDays: 14,
      inactivityLockEnabled: true,
    });
    assert.strictEqual(updated.sessionTimeoutDays, 14);
    assert.strictEqual(updated.inactivityLockEnabled, true);

    // Out-of-bounds timeout rejection
    await assert.rejects(
      async () => {
        await updateSecuritySettings(testUserId, { sessionTimeoutDays: 100 });
      },
      (err: any) => err.message.includes('sessionTimeoutDays must be an integer between 1 and 90')
    );
  });

  test('8. Expiry scheduler respects user notification milestone preferences', async () => {
    const customTracker = new NotificationTracker();

    // Document due in 30 days
    const targetDoc = {
      id: 'doc-passport-001',
      title: 'Indian Passport',
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };

    // When reminder30Days is enabled (true), notification is evaluated
    const enabledResult = await checkAndDispatchDocumentExpiryNotification({
      document: targetDoc,
      user: { id: testUserId, email: testEmail },
      tracker: customTracker,
      notificationPreferences: { reminder30Days: true },
    });
    // Can be sent or tracked
    assert.notStrictEqual(enabledResult.status, 'skipped_preference_disabled');

    // When reminder30Days is disabled (false), notification is skipped with skipped_preference_disabled
    const disabledTracker = new NotificationTracker();
    const disabledResult = await checkAndDispatchDocumentExpiryNotification({
      document: targetDoc,
      user: { id: testUserId, email: testEmail },
      tracker: disabledTracker,
      notificationPreferences: { reminder30Days: false },
    });
    assert.strictEqual(disabledResult.notified, false);
    assert.strictEqual(disabledResult.status, 'skipped_preference_disabled');
    assert.strictEqual(disabledResult.milestone, 30);
  });

  test('9. updateProfileSettings updates household/family name individually and persists', async () => {
    const updated = await updateProfileSettings(testUserId, {
      householdName: 'Only New Family Name',
    });
    assert.strictEqual(updated.familyName, 'Only New Family Name');
    assert.strictEqual(updated.fullName, 'Athil Chalil');

    const fresh = await getUserSettings(testUserId);
    assert.strictEqual(fresh.profile.familyName, 'Only New Family Name');
    assert.strictEqual(fresh.profile.fullName, 'Athil Chalil');
  });

  test('10. updateProfileSettings updates account holder full name individually and persists', async () => {
    const updated = await updateProfileSettings(testUserId, {
      fullName: 'Only New Full Name',
    });
    assert.strictEqual(updated.fullName, 'Only New Full Name');
    assert.strictEqual(updated.familyName, 'Chalil Kudumbam');

    const fresh = await getUserSettings(testUserId);
    assert.strictEqual(fresh.profile.fullName, 'Only New Full Name');
    assert.strictEqual(fresh.profile.familyName, 'Chalil Kudumbam');
  });

  test('11. updateProfileSettings rejects household name shorter than 2 or longer than 120 chars', async () => {
    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { householdName: 'X' });
      },
      { message: 'Household name must be at least 2 characters.' }
    );

    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { householdName: 'H'.repeat(121) });
      },
      { message: 'Household name cannot exceed 120 characters.' }
    );
  });

  test('12. updateProfileSettings rejects attempts to modify protected fields', async () => {
    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { role: 'ADMIN' } as any);
      },
      { message: "Modifying protected field 'role' is strictly forbidden." }
    );

    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { status: 'SUSPENDED' } as any);
      },
      { message: "Modifying protected field 'status' is strictly forbidden." }
    );

    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { email: 'hacker@vault.com' } as any);
      },
      { message: "Modifying protected field 'email' is strictly forbidden." }
    );
  });

  test('13. Root Cause Defense: User.findOrCreateBySupabaseUser preserves user-updated profile against stale token metadata', async () => {
    const sbUserId = 'sb-auth-token-user-test-789';
    // 1. Initial user login / creation from Supabase JWT metadata
    const initialUser = await User.findOrCreateBySupabaseUser({
      supabaseUserId: sbUserId,
      email: 'member@chalil.com',
      fullName: 'Original Token FullName',
      familyName: 'Original Token Family',
      isEmailVerified: true,
    });
    assert.strictEqual(initialUser.fullName, 'Original Token FullName');
    assert.strictEqual(initialUser.familyName, 'Original Token Family');

    // 2. User goes to Settings and saves new values
    const userId = initialUser._id ? initialUser._id.toString() : initialUser.id;
    const updated = await updateProfileSettings(userId, {
      fullName: 'Athil Chalil (Persisted Edit)',
      householdName: 'Chalil Maha Kudumbam (Persisted Edit)',
    });
    assert.strictEqual(updated.fullName, 'Athil Chalil (Persisted Edit)');
    assert.strictEqual(updated.familyName, 'Chalil Maha Kudumbam (Persisted Edit)');

    // 3. User refreshes browser. Supabase auth token is re-sent containing original token metadata.
    // requireAuth / syncMongoProfileFromSupabase calls findOrCreateBySupabaseUser with stale metadata:
    const subsequentSyncUser = await User.findOrCreateBySupabaseUser({
      supabaseUserId: sbUserId,
      email: 'member@chalil.com',
      fullName: 'Original Token FullName',
      familyName: 'Original Token Family',
      isEmailVerified: true,
    });

    // 4. Verify that the updated values in MongoDB were NOT overwritten by stale token metadata!
    assert.strictEqual(subsequentSyncUser.fullName, 'Athil Chalil (Persisted Edit)');
    assert.strictEqual(subsequentSyncUser.familyName, 'Chalil Maha Kudumbam (Persisted Edit)');

    // 5. Subsequent getUserSettings fetch also reflects the persisted edits
    const reloadedSettings = await getUserSettings(userId);
    assert.strictEqual(reloadedSettings.profile.fullName, 'Athil Chalil (Persisted Edit)');
    assert.strictEqual(reloadedSettings.profile.familyName, 'Chalil Maha Kudumbam (Persisted Edit)');
  });

  test('14. updateProfileSettings rejects empty strings for name and household', async () => {
    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { fullName: '   ' });
      },
      { message: 'Full name must be at least 2 characters.' }
    );

    await assert.rejects(
      async () => {
        await updateProfileSettings(testUserId, { householdName: '   ' });
      },
      { message: 'Household name must be at least 2 characters.' }
    );
  });

  test('15. updateProfileSettings rejects non-existent user profile when mock user not found', async () => {
    const nonExistentId = 'nonexistent-user-id-999';
    await assert.rejects(
      async () => {
        // When not found in store and fallback is disabled/exhausted
        process.env.ALLOW_MOCK_DB = 'false';
        const origEnv = process.env.NODE_ENV;
        try {
          process.env.NODE_ENV = 'production';
          await updateProfileSettings(nonExistentId, { fullName: 'Valid Name' });
        } finally {
          process.env.NODE_ENV = origEnv;
          process.env.ALLOW_MOCK_DB = 'true';
        }
      },
      (err: any) =>
        err.message.includes('unavailable') ||
        err.message.includes('not found') ||
        err.message.includes('MONGODB_URI') ||
        err.message.includes('required')
    );
  });
});
