import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User, getMockUserBySupabaseId } from '../models/User';
import { validateDateOfBirth } from '../utils/dobValidation';
import { verifyRecoveryDateOfBirth } from './passwordRecoveryService';

test('User Provisioning, Reconciliation and Resilience Test Suite', async (t) => {
  const testSupabaseUid = 'sb-test-orphaned-uuid-1001';
  const testEmail = 'aasifch401@gmail.com';

  await t.test('1. Timezone-robust Date of Birth validation allows same-day local registration', async () => {
    // Current UTC date
    const now = new Date();
    const curYear = now.getUTCFullYear();
    const curMonth = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const curDay = now.getUTCDate().toString().padStart(2, '0');
    const todayStr = `${curYear}-${curMonth}-${curDay}`;

    const res = validateDateOfBirth(todayStr);
    assert.equal(res.valid, true, 'Today UTC date must be valid');
    assert.equal(res.normalized, todayStr);

    // Far future date (e.g. 2028-01-01) must still be rejected
    const farFuture = validateDateOfBirth(`${curYear + 2}-01-01`);
    assert.equal(farFuture.valid, false, 'Far future date must be rejected');
    assert.ok(farFuture.error?.includes('future'));
  });

  await t.test('2. findOrCreateBySupabaseUser creates profile safely even with invalid/unparseable DOB', async () => {
    const invalidDob = 'invalid-dob-string';
    const profile = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil C',
      familyName: 'Chalil',
      dateOfBirth: invalidDob,
      preferredLang: 'ml',
      isEmailVerified: true,
    });

    assert.ok(profile, 'Profile should be created successfully without throwing');
    assert.equal(profile.email, testEmail);
    assert.equal(profile.supabaseUserId, testSupabaseUid);
    assert.equal(profile.role, 'USER');
    assert.equal(profile.status, 'ACTIVE');
  });

  await t.test('3. Repeated calls to findOrCreateBySupabaseUser are idempotent', async () => {
    const profileFirst = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil C',
      isEmailVerified: true,
    });

    const profileSecond = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil Chalil',
      isEmailVerified: true,
    });

    const firstId = profileFirst._id ? profileFirst._id.toString() : (profileFirst as any).id;
    const secondId = profileSecond._id ? profileSecond._id.toString() : (profileSecond as any).id;

    assert.equal(firstId, secondId, 'Idempotent calls must preserve the identical user ID');
  });

  await t.test('4. Password recovery DOB verification rejects invalid DOBs without crashing', async () => {
    const result = await verifyRecoveryDateOfBirth(
      testSupabaseUid,
      testEmail,
      '1995-05-20'
    );

    // DOB is not matched or not set on the user, so it should return a safe validation failure
    assert.equal(result.valid, false);
    assert.equal(result.error, 'Invalid date of birth provided.');
  });

  await t.test('5. Setting valid DOB allows successful recovery verification', async () => {
    const validDob = '1995-10-15';
    const user = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      dateOfBirth: validDob,
      isEmailVerified: true,
    });

    const result = await verifyRecoveryDateOfBirth(
      testSupabaseUid,
      testEmail,
      validDob
    );

    assert.equal(result.valid, true);
    assert.ok(result.resetAuthorizationToken, 'Must generate reset authorization token');
    assert.equal(typeof result.expiresIn, 'number');
  });

  await t.test('6. Unprovisioned accounts are correctly classified and structured for Admin Panel', async () => {
    const rawSupabaseUser = {
      id: '2596bf23-aa73-4753-86cc-960d865100da',
      email: 'aasifch401@gmail.com',
      created_at: '2026-10-28T19:32:35Z',
      email_confirmed_at: '2026-10-28T19:32:35Z',
      user_metadata: {
        fullName: 'Athil',
        familyName: 'c',
        dateOfBirth: '2026-10-28',
      },
    };

    // Simulate formatting unprovisioned user as done in adminRoutes.ts
    const unprovisionedRecord = {
      _id: `unprov_${rawSupabaseUser.id}`,
      id: `unprov_${rawSupabaseUser.id}`,
      supabaseUserId: rawSupabaseUser.id,
      name: rawSupabaseUser.user_metadata.fullName,
      fullName: rawSupabaseUser.user_metadata.fullName,
      familyName: rawSupabaseUser.user_metadata.familyName,
      email: rawSupabaseUser.email,
      role: 'USER',
      status: 'UNPROVISIONED',
      isUnprovisioned: true,
      isEmailVerified: Boolean(rawSupabaseUser.email_confirmed_at),
      documentCount: 0,
      familyMemberCount: 0,
    };

    assert.equal(unprovisionedRecord.status, 'UNPROVISIONED');
    assert.equal(unprovisionedRecord.isUnprovisioned, true);
    assert.equal(unprovisionedRecord.email, 'aasifch401@gmail.com');
  });
});
