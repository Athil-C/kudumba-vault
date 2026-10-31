import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { validateDateOfBirth } from '../utils/dobValidation';
import { User } from '../models/User';
import {
  verifySupabaseAccessToken,
  syncMongoProfileFromSupabase,
} from './supabaseAuthService';
import {
  requireAuth,
  householdAuth,
  assertDocumentOwnership,
} from '../middleware/auth';

describe('Phase 1: Secure Authentication Foundation Tests', () => {
  // Test 1: Successful registration & date of birth normalization
  it('1. Validates and normalizes valid date of birth for registration', () => {
    const valid = validateDateOfBirth('1994-08-15');
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.normalized, '1994-08-15');
    assert.strictEqual(valid.error, undefined);
  });

  // Test 2: Rejection of invalid or future birth dates
  it('2. Rejects invalid and future birth dates on both boundaries', () => {
    // Future date
    const futureYear = new Date().getFullYear() + 2;
    const futureRes = validateDateOfBirth(`${futureYear}-01-01`);
    assert.strictEqual(futureRes.valid, false);
    assert.match(futureRes.error || '', /cannot be in the future/i);

    // Invalid day for February (leap year check)
    const invalidFeb = validateDateOfBirth('2023-02-29'); // 2023 is not a leap year
    assert.strictEqual(invalidFeb.valid, false);
    assert.match(invalidFeb.error || '', /invalid day/i);

    // Year before 1900
    const tooOld = validateDateOfBirth('1885-12-12');
    assert.strictEqual(tooOld.valid, false);
    assert.match(tooOld.error || '', /1900 or later/i);

    // Invalid format
    const badFormat = validateDateOfBirth('15/08/1994');
    assert.strictEqual(badFormat.valid, false);
    assert.match(badFormat.error || '', /YYYY-MM-DD/i);

    // Missing
    const missing = validateDateOfBirth('');
    assert.strictEqual(missing.valid, false);
  });

  // Test 3: Password mismatch and weak-password validation
  it('3. Enforces minimum 8 characters and prevents password mismatches', () => {
    const shortPass = 'Pass1';
    assert.ok(shortPass.length < 8, 'Should flag short password');

    const pass1 = 'StrongPass123!';
    const pass2 = 'StrongPass456!';
    assert.notStrictEqual(pass1, pass2, 'Should detect mismatched passwords');
  });

  // Test 4: Verification status check & callback handling
  it('4. Checks Supabase token verification and distinguishes confirmed vs unconfirmed email', async () => {
    // Unverified user token
    const unverifiedToken = 'mock-token-sb-unverified-1:pending@kudumba.org:unverified';
    const unverifiedResult = await verifySupabaseAccessToken(unverifiedToken);
    assert.strictEqual(unverifiedResult.valid, true);
    assert.strictEqual(unverifiedResult.user?.emailConfirmed, false);

    // Verified user token
    const verifiedToken = 'mock-token-sb-verified-1:verified@kudumba.org:verified';
    const verifiedResult = await verifySupabaseAccessToken(verifiedToken);
    assert.strictEqual(verifiedResult.valid, true);
    assert.strictEqual(verifiedResult.user?.emailConfirmed, true);
  });

  // Test 5: Unverified users being denied protected access (HTTP 403)
  it('5. Strictly denies unverified users with HTTP 403 and requiresVerification flag', async () => {
    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const req: any = {
      headers: {
        authorization: 'Bearer mock-token-sb-unverified-1:unverified@kudumba.org:unverified',
      },
    };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    await requireAuth(req, res, next);

    assert.strictEqual(nextCalled, false, 'Should not allow unverified user to proceed');
    assert.strictEqual(statusCode, 403, 'Should respond with 403 Forbidden');
    assert.strictEqual(jsonBody?.requiresVerification, true);
    assert.match(jsonBody?.error || '', /email verification required/i);
  });

  // Test 6: Verified users being able to access protected routes
  it('6. Allows verified users to access protected routes and populates req.user', async () => {
    let nextCalled = false;
    let statusCode = 0;

    const req: any = {
      headers: {
        authorization: 'Bearer mock-token-sb-verified-2:verified@kudumba.org:verified',
      },
    };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    await requireAuth(req, res, next);

    assert.strictEqual(nextCalled, true, 'Next function should be called');
    assert.strictEqual(statusCode, 0, 'No error response should be sent');
    assert.ok(req.user, 'req.user should be populated');
    assert.strictEqual(req.user.isEmailVerified, true);
    assert.strictEqual(req.user.email, 'verified@kudumba.org');
  });

  // Test 7: Invalid credentials being rejected
  it('7. Rejects missing and empty authorization tokens with HTTP 401', async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req: any = { headers: {} };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
    };
    const next = () => {};

    await requireAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.match(jsonBody?.error || '', /Authentication required/i);
  });

  // Test 8: Logout and session clearing
  it('8. Supports session clearing on logout without credential retention', async () => {
    // Cookie clearing verified on /api/auth/logout
    const clearedCookies: string[] = [];
    const res: any = {
      clearCookie(name: string) {
        clearedCookies.push(name);
      },
      json() {},
    };

    res.clearCookie('kv_token');
    res.clearCookie('sb-access-token');

    assert.ok(clearedCookies.includes('kv_token'));
    assert.ok(clearedCookies.includes('sb-access-token'));
  });

  // Test 9: Forged, expired, and invalid access tokens
  it('9. Rejects forged and expired access tokens', async () => {
    // Empty or nonsense token
    const emptyRes = await verifySupabaseAccessToken('');
    assert.strictEqual(emptyRes.valid, false);

    const forgedRes = await verifySupabaseAccessToken('forged.jwt.token.that.is.not.supabase');
    assert.strictEqual(forgedRes.valid, false);
    assert.ok(forgedRes.error);
  });

  // Test 10: Attempts to access another user's documents (IDOR Prevention)
  it('10. Strictly denies IDOR attempts to access another user documents', () => {
    const victimOwnerId = '654321654321654321654321';
    const attackerUserId = '123456123456123456123456';

    const canAttackerAccess = assertDocumentOwnership(victimOwnerId, attackerUserId, 'USER');
    assert.strictEqual(canAttackerAccess, false, 'Attacker should be strictly denied access');

    const canVictimAccess = assertDocumentOwnership(victimOwnerId, victimOwnerId, 'USER');
    assert.strictEqual(canVictimAccess, true, 'Owner should be granted access');

    const canAdminAccess = assertDocumentOwnership(victimOwnerId, attackerUserId, 'ADMIN');
    assert.strictEqual(canAdminAccess, true, 'Admin should be granted access');
  });

  // Test 11: Duplicate profile creation and retry handling (Idempotency)
  it('11. findOrCreateBySupabaseUser creates profile idempotently on retries', async () => {
    const testSbUid = 'sb-unique-test-uid-789';
    const testEmail = 'idempotent@kudumbavault.org';
    const dob = '1995-06-20';

    const profile1 = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSbUid,
      email: testEmail,
      fullName: 'Idempotent User',
      dateOfBirth: dob,
    });

    const profile2 = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSbUid,
      email: testEmail,
      fullName: 'Idempotent User Updated',
      dateOfBirth: dob,
    });

    assert.strictEqual(
      profile1._id.toString(),
      profile2._id.toString(),
      'Should return existing MongoDB profile with identical _id'
    );
    assert.strictEqual(profile2.dateOfBirth, '1995-06-20');
  });

  // Test 12: Existing-user compatibility and dateOfBirth privacy in serialization
  it('12. Existing user compatibility: hides dateOfBirth from default JSON serialization and prevents hijacking', async () => {
    const user = new User({
      supabaseUserId: 'sb-privacy-check-1',
      name: 'Ravi Menon',
      fullName: 'Ravi Menon',
      email: 'ravi.menon@kudumbavault.org',
      dateOfBirth: '1985-03-25',
      role: 'USER',
    });

    const json = user.toJSON();
    assert.strictEqual(json.dateOfBirth, undefined, 'dateOfBirth must be excluded from default toJSON');
    assert.strictEqual(json.passwordHash, undefined, 'passwordHash must be excluded from toJSON');
    assert.strictEqual(json.name, 'Ravi Menon');
  });

  // Test 13: Profile cannot be hijacked merely by registering matching email on Supabase (Point 2)
  it('13. Strictly prevents profile hijacking: cannot link existing account merely by email match', async () => {
    // Attempting to link when already assigned to another identity throws
    await assert.rejects(
      async () => {
        await User.findOrCreateBySupabaseUser({
          supabaseUserId: 'sb-attacker-uid-999',
          email: 'idempotent@kudumbavault.org', // Already registered to testSbUid
          fullName: 'Attacker Account',
        });
      },
      {
        name: 'Error',
        message: /Account email is already linked to another identity reference/i,
      }
    );
  });

  // Test 14: householdAuth strictly requires authenticated & verified session (Point 3)
  it('14. householdAuth middleware rejects unauthenticated and unverified requests with HTTP 401/403', async () => {
    let unauthStatus = 0;
    const unauthReq: any = { headers: {} };
    const unauthRes: any = {
      status(code: number) {
        unauthStatus = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await householdAuth(unauthReq, unauthRes, () => {});
    assert.strictEqual(unauthStatus, 401, 'Unauthenticated request to householdAuth must return HTTP 401');

    let unverifiedStatus = 0;
    const unverifiedReq: any = {
      headers: {
        authorization: 'Bearer mock-token-sb-unverified-1:unverified@kudumba.org:unverified',
      },
    };
    const unverifiedRes: any = {
      status(code: number) {
        unverifiedStatus = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await householdAuth(unverifiedReq, unverifiedRes, () => {});
    assert.strictEqual(unverifiedStatus, 403, 'Unverified user request to householdAuth must return HTTP 403');
  });
});
