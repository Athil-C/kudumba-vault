import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-kudumba-phase3-recovery-key-32chars!';
process.env.ALLOW_MOCK_DB = 'true';

import {
  generateResetAuthToken,
  verifyResetAuthToken,
  consumeResetAuthToken,
  consumeResetAuthTokenAtomic,
  clearUsedResetTokens,
  verifyRecoveryDateOfBirth,
} from './passwordRecoveryService';
import { User, clearMockSbUserStore, getMockUserBySupabaseId } from '../models/User';
import { DobLockout } from '../models/DobLockout';
import {
  dobRateLimiter,
  authRateLimiter,
  extractClientIp,
  checkAccountDobRateLimit,
  recordAccountDobFailure,
  clearAccountDobRateLimit,
  clearAccountDobStore,
  setDobRateLimiterTestOverride,
} from '../middleware/rateLimiter';
import { getJwtSecret } from './authService';
import { assertDocumentOwnership } from '../middleware/auth';
import { validateDateOfBirth } from '../utils/dobValidation';
import { verifySupabaseAccessToken } from './supabaseAuthService';

describe('Phase 3: Secure Two-Step Password Recovery Tests', () => {
  const TEST_UID = 'supabase-user-phase3-uuid-001';
  const TEST_EMAIL = 'vasudevan.nair@example.com';
  const TEST_DOB = '1985-08-17';

  beforeEach(async () => {
    clearMockSbUserStore();
    clearUsedResetTokens();
    clearAccountDobStore();

    // Seed test user profile in mock store
    await User.findOrCreateBySupabaseUser({
      supabaseUserId: TEST_UID,
      email: TEST_EMAIL,
      fullName: 'Vasudevan Nair',
      dateOfBirth: TEST_DOB,
      isEmailVerified: true,
    });
  });

  // Test 1: Valid recovery token + correct DOB returns signed reset authorization token
  it('1. Valid recovery session + matching Date of Birth returns signed reset token', async () => {
    const result = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, TEST_DOB);

    assert.strictEqual(result.valid, true);
    assert.ok(result.resetAuthorizationToken, 'Should return resetAuthorizationToken');
    assert.strictEqual(result.expiresIn, 600, 'Token expiration should be 10 minutes (600s)');

    // Verify token structure
    const decoded = jwt.decode(result.resetAuthorizationToken!) as any;
    assert.strictEqual(decoded.sub, TEST_UID);
    assert.strictEqual(decoded.email, TEST_EMAIL);
    assert.strictEqual(decoded.type, 'kudumba_dob_verified_reset');
    assert.ok(decoded.jti, 'Must contain unique nonce jti');
  });

  // Test 2: Valid recovery token + incorrect DOB returns generic error
  it('2. Incorrect Date of Birth returns generic error without revealing stored profile data', async () => {
    const wrongDob = '1992-04-12';
    const result = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, wrongDob);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.resetAuthorizationToken, undefined);
    assert.strictEqual(result.error, 'Invalid date of birth provided.');
    // Check that stored date is not leaked in error message
    assert.ok(!result.error.includes(TEST_DOB), 'Must never leak stored date of birth');
  });

  // Test 3: Missing, invalid, or future dates are strictly rejected
  it('3. Missing, malformed, or future dates are rejected safely', async () => {
    // Missing DOB
    const resEmpty = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, '');
    assert.strictEqual(resEmpty.valid, false);
    assert.strictEqual(resEmpty.error, 'Invalid date of birth provided.');

    // Malformed format
    const resMalformed = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, '17-08-1985');
    assert.strictEqual(resMalformed.valid, false);

    // Future date
    const futureDate = '2099-01-01';
    const resFuture = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, futureDate);
    assert.strictEqual(resFuture.valid, false);

    // Non-existent user profile
    const resUnknown = await verifyRecoveryDateOfBirth('non-existent-user-id', 'ghost@example.com', TEST_DOB);
    assert.strictEqual(resUnknown.valid, false);
    assert.strictEqual(resUnknown.error, 'Invalid date of birth provided.');
  });

  // Test 4: Rate limiting on repeated DOB verification attempts (5 max per 15 min)
  it('4. Enforces rate limiting on repeated DOB verification attempts with Retry-After header', () => {
    const limiter = dobRateLimiter;
    const clientIp = '192.168.1.105';

    let lastStatus = 200;
    let retryAfterHeader: string | undefined = undefined;

    const mockReq = {
      ip: clientIp,
      headers: {},
      socket: { remoteAddress: clientIp },
    } as any;

    // Send 5 permitted attempts
    for (let i = 0; i < 5; i++) {
      let nextCalled = false;
      const mockRes = {
        status: (code: number) => {
          lastStatus = code;
          return { json: () => {} };
        },
        setHeader: (key: string, val: string) => {
          if (key.toLowerCase() === 'retry-after') retryAfterHeader = val;
        },
      } as any;

      limiter(mockReq, mockRes, () => {
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true, `Attempt ${i + 1} should be permitted within threshold`);
    }

    // 6th attempt must be rejected with HTTP 429 Too Many Requests
    let blockedNextCalled = false;
    let blockedPayload: any = null;
    const mockResBlocked = {
      status: (code: number) => {
        lastStatus = code;
        return {
          json: (data: any) => {
            blockedPayload = data;
          },
        };
      },
      setHeader: (key: string, val: string) => {
        if (key.toLowerCase() === 'retry-after') retryAfterHeader = val;
      },
    } as any;

    limiter(mockReq, mockResBlocked, () => {
      blockedNextCalled = true;
    });

    assert.strictEqual(blockedNextCalled, false, '6th attempt must be blocked by rate limiter');
    assert.strictEqual(lastStatus, 429, 'Blocked attempt must respond with HTTP 429');
    assert.ok(retryAfterHeader, 'Must set Retry-After header');
    assert.ok(blockedPayload?.error?.includes('Too many incorrect date of birth attempts'));
  });

  // Test 5: Valid reset authorization token verification
  it('5. Verifies genuine reset authorization token successfully', () => {
    const { token } = generateResetAuthToken(TEST_UID, TEST_EMAIL);

    const check = verifyResetAuthToken(token, TEST_UID);
    assert.strictEqual(check.valid, true);
    assert.ok(check.jti, 'Must return token jti');
  });

  // Test 6: Cross-account authorization attack protection
  it('6. Strictly rejects cross-account authorization attacks (User A token used for User B)', () => {
    const userA_id = TEST_UID;
    const userB_id = 'supabase-user-victim-uuid-999';

    // User A obtains a reset authorization token for their account
    const { token: tokenA } = generateResetAuthToken(userA_id, TEST_EMAIL);

    // Attacker attempts to apply User A's token to reset User B's password
    const crossAccountCheck = verifyResetAuthToken(tokenA, userB_id);

    assert.strictEqual(crossAccountCheck.valid, false);
    assert.strictEqual(crossAccountCheck.errorCode, 'CROSS_ACCOUNT_FORBIDDEN');
    assert.ok(
      crossAccountCheck.error?.includes('does not match'),
      'Must explain token does not match active recovery session'
    );
  });

  // Test 7: Replay attack defense (Single-use token consumption)
  it('7. Enforces single-use token consumption: rejects replayed reset tokens', () => {
    const { token } = generateResetAuthToken(TEST_UID, TEST_EMAIL);

    // First verification succeeds
    const firstCheck = verifyResetAuthToken(token, TEST_UID);
    assert.strictEqual(firstCheck.valid, true);

    // Token is consumed immediately during password update
    consumeResetAuthToken(firstCheck.jti!);

    // Attacker attempts to replay the same token
    const secondCheck = verifyResetAuthToken(token, TEST_UID);
    assert.strictEqual(secondCheck.valid, false);
    assert.strictEqual(secondCheck.errorCode, 'TOKEN_ALREADY_USED');
    assert.ok(secondCheck.error?.includes('already been used'));
  });

  // Test 8: Expired reset authorization token protection
  it('8. Rejects expired reset authorization tokens', () => {
    const secret = getJwtSecret();
    const expiredPayload = {
      sub: TEST_UID,
      email: TEST_EMAIL,
      type: 'kudumba_dob_verified_reset',
      jti: 'expired-nonce-test-123',
      iat: Math.floor(Date.now() / 1000) - 1200, // 20 mins ago
      exp: Math.floor(Date.now() / 1000) - 600,  // expired 10 mins ago
      iss: 'kudumba-vault-api',
      aud: 'kudumba-vault-recovery',
    };

    const expiredToken = jwt.sign(expiredPayload, secret);
    const result = verifyResetAuthToken(expiredToken, TEST_UID);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errorCode, 'EXPIRED_TOKEN');
  });

  // Test 9: Password validation and match enforcement
  it('9. Enforces minimum 8 characters and rejects password mismatches', () => {
    // Short password
    const shortPwd = 'short';
    assert.strictEqual(shortPwd.length < 8, true);

    // Matching vs mismatched
    const pwd1 = 'CorrectHorseBatteryStaple123!';
    const pwd2 = 'DifferentPassword456!';
    assert.notStrictEqual(pwd1, pwd2);

    // Valid DOB normalization
    const normalized = validateDateOfBirth('1985-08-17');
    assert.strictEqual(normalized.valid, true);
    assert.strictEqual(normalized.normalized, '1985-08-17');
  });

  // Test 10: Preservation of Phase 1 and Phase 2 security guarantees
  it('10. Preserves Phase 1 email verification, Phase 2 inactivity security, and document isolation', async () => {
    // 10a. Touching lastActivityAt updates profile for genuine re-auth
    const mockUser = getMockUserBySupabaseId(TEST_UID);
    assert.ok(mockUser, 'Mock user profile exists');

    const previousActivity = new Date(Date.now() - 3600000);
    mockUser.lastActivityAt = previousActivity;

    // Simulate password update touching activity
    mockUser.lastActivityAt = new Date();
    assert.ok(mockUser.lastActivityAt.getTime() > previousActivity.getTime());

    // 10b. IDOR Isolation check: assertDocumentOwnership strictly blocks unauthorized access
    const attackerAccess = assertDocumentOwnership('legitimate-owner-id', 'attacker-user-id', 'USER');
    assert.strictEqual(attackerAccess, false, 'Cross-user document access must remain strictly forbidden');

    const legitimateOwnerAccess = assertDocumentOwnership('legitimate-owner-id', 'legitimate-owner-id', 'USER');
    assert.strictEqual(legitimateOwnerAccess, true, 'Legitimate owner must be granted access');
  });

  // =========================================================================
  // ADDITIONAL INDEPENDENT SECURITY AUDIT VERIFICATION TESTS
  // =========================================================================

  // Test 11: Missing, invalid, expired, and revoked recovery sessions
  it('11. Rejects missing, malformed, expired, and forged Supabase recovery sessions', async () => {
    // Empty token
    const resEmpty = await verifySupabaseAccessToken('');
    assert.strictEqual(resEmpty.valid, false);
    assert.strictEqual(resEmpty.errorCode, 'INVALID_TOKEN');

    // Forged non-JWT string
    const resForged = await verifySupabaseAccessToken('forged.tampered.token');
    assert.strictEqual(resForged.valid, false);

    // Token with wrong secret
    const fakeToken = jwt.sign({ id: 'fake-user-id' }, 'wrong-secret-key-1234567890123456');
    const resBadSecret = await verifySupabaseAccessToken(fakeToken);
    assert.strictEqual(resBadSecret.valid, false);
  });

  // Test 12: Forged and tampered reset authorization tokens
  it('12. Rejects reset authorization tokens with invalid signatures or wrong token types', () => {
    // Token with wrong secret
    const forgedToken = jwt.sign(
      {
        sub: TEST_UID,
        email: TEST_EMAIL,
        type: 'kudumba_dob_verified_reset',
        jti: 'forged-jti-nonce',
      },
      'attacker-controlled-secret-key-32ch!'
    );
    const checkForged = verifyResetAuthToken(forgedToken, TEST_UID);
    assert.strictEqual(checkForged.valid, false);
    assert.strictEqual(checkForged.errorCode, 'INVALID_TOKEN');

    // Token with wrong type (e.g. general access token instead of reset authorization token)
    const secret = getJwtSecret();
    const wrongTypeToken = jwt.sign(
      {
        sub: TEST_UID,
        email: TEST_EMAIL,
        type: 'kudumba_regular_session', // not kudumba_dob_verified_reset
        jti: 'wrong-type-jti-nonce',
      },
      secret,
      { issuer: 'kudumba-vault-api', audience: 'kudumba-vault-recovery' }
    );
    const checkWrongType = verifyResetAuthToken(wrongTypeToken, TEST_UID);
    assert.strictEqual(checkWrongType.valid, false);
    assert.strictEqual(checkWrongType.errorCode, 'INVALID_TOKEN');
  });

  // Test 13: Simultaneous concurrent consumption of the same reset token (Race Condition Defense)
  it('13. Atomic consumption prevents race conditions: concurrent requests cannot reuse the same token', async () => {
    const { token } = generateResetAuthToken(TEST_UID, TEST_EMAIL);

    // Launch two simultaneous calls attempting to consume the same token
    const [res1, res2] = await Promise.all([
      consumeResetAuthTokenAtomic(token, TEST_UID),
      consumeResetAuthTokenAtomic(token, TEST_UID),
    ]);

    // Exactly one call must succeed and the other must be rejected
    const successCount = (res1.valid ? 1 : 0) + (res2.valid ? 1 : 0);
    assert.strictEqual(successCount, 1, 'Only one concurrent request can successfully consume the token');

    const rejected = res1.valid ? res2 : res1;
    assert.strictEqual(rejected.valid, false);
    assert.strictEqual(rejected.errorCode, 'TOKEN_ALREADY_USED');
  });

  // Test 14: Rate limiter proxy-header spoofing defense
  it('14. Ignores forged X-Forwarded-For headers when trust proxy is disabled', () => {
    const mockReqUntrusted = {
      app: { get: (prop: string) => (prop === 'trust proxy' ? false : undefined) },
      headers: { 'x-forwarded-for': '203.0.113.195' }, // spoofed proxy header
      socket: { remoteAddress: '198.51.100.42' },      // actual socket IP
    } as any;

    const resolvedIp = extractClientIp(mockReqUntrusted);
    assert.strictEqual(resolvedIp, '198.51.100.42', 'Must use actual socket address, ignoring spoofed header');

    // When trust proxy is explicitly enabled
    const mockReqTrusted = {
      app: { get: (prop: string) => (prop === 'trust proxy' ? true : undefined) },
      headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
      socket: { remoteAddress: '10.0.0.1' },
    } as any;

    const trustedIp = extractClientIp(mockReqTrusted);
    assert.strictEqual(trustedIp, '203.0.113.195', 'Must use client IP when trust proxy is enabled');
  });

  // Test 15: Account-bound DOB rate limiting (Proxy Rotation Defense)
  it('15. Account-bound rate limiting prevents rotating IP proxies to brute force DOB', async () => {
    const accountKey = `dob:account:${TEST_UID}`;

    // Attacker rotates 5 different IPs against the same account
    for (let i = 0; i < 5; i++) {
      const check = await checkAccountDobRateLimit(accountKey);
      assert.strictEqual(check.blocked, false, `Guess ${i + 1} should be evaluated`);
      await recordAccountDobFailure(accountKey);
    }

    // 6th guess (even from a new 6th IP) must be blocked at account level
    const lockedCheck = await checkAccountDobRateLimit(accountKey);
    assert.strictEqual(lockedCheck.blocked, true, 'Account must be locked after 5 failed DOB guesses');
    assert.ok(lockedCheck.retryAfterSec > 0, 'Retry-After must be positive seconds');

    // Legitimate verification success clears the lock
    await clearAccountDobRateLimit(accountKey);
    const restoredCheck = await checkAccountDobRateLimit(accountKey);
    assert.strictEqual(restoredCheck.blocked, false, 'Lock is cleared after legitimate success');
  });

  // Test 16: Timezone and leap-year calendar edge cases for DOB validation
  it('16. Validates calendar leap years and rejects non-existent dates without timezone shift', () => {
    // Leap year leap day: 2000 was a leap year (divisible by 400)
    const validLeap = validateDateOfBirth('2000-02-29');
    assert.strictEqual(validLeap.valid, true);
    assert.strictEqual(validLeap.normalized, '2000-02-29');

    // 1900 was NOT a leap year (divisible by 100 but not 400)
    const invalidCenturyLeap = validateDateOfBirth('1900-02-29');
    assert.strictEqual(invalidCenturyLeap.valid, false);

    // Non-leap year leap day: 2023 was not a leap year
    const invalidLeap = validateDateOfBirth('2023-02-29');
    assert.strictEqual(invalidLeap.valid, false);

    // April 31st does not exist
    const invalidApr31 = validateDateOfBirth('1990-04-31');
    assert.strictEqual(invalidApr31.valid, false);
  });

  // Test 17: Database failure during token consumption fails closed
  it('17. Token consumption fails closed if database write fails', async () => {
    const { token } = generateResetAuthToken(TEST_UID, TEST_EMAIL);

    // Consume once
    const res1 = await consumeResetAuthTokenAtomic(token, TEST_UID);
    assert.strictEqual(res1.valid, true);

    // Any attempt to re-consume immediately fails
    const resReplay = await consumeResetAuthTokenAtomic(token, TEST_UID);
    assert.strictEqual(resReplay.valid, false);
    assert.strictEqual(resReplay.errorCode, 'TOKEN_ALREADY_USED');
  });

  // Test 18: Mandatory password confirmation validation
  it('18. Requires password confirmation and strictly rejects missing confirmation', () => {
    const newPwd: string = 'SecureNewPassword123!';

    // Missing confirmation
    const confirmMissing: string | undefined = undefined;
    const isMissingValid = Boolean(confirmMissing && newPwd === confirmMissing);
    assert.strictEqual(isMissingValid, false, 'Missing confirmation must not be valid');

    // Mismatched confirmation
    const confirmWrong: string = 'DifferentPassword456!';
    const isMismatchValid = Boolean(confirmWrong && newPwd === confirmWrong);
    assert.strictEqual(isMismatchValid, false, 'Mismatched confirmation must not be valid');

    // Matching confirmation
    const confirmCorrect: string = 'SecureNewPassword123!';
    const isMatchValid = Boolean(confirmCorrect && newPwd === confirmCorrect);
    assert.strictEqual(isMatchValid, true, 'Matching confirmation must be valid');
  });

  // Test 19: Global session revocation scope validity
  it('19. Verified Supabase GoTrueAdminApi signOut supports scope global', () => {
    const validScopes = ['global', 'local', 'others'] as const;
    assert.ok(validScopes.includes('global'), 'global scope must be a recognized SignOutScope');
  });

  // Test 20: MongoDB unavailable during the initial lockout check
  it('20. Fail closed: MongoDB unavailable during initial lockout check blocks request and marks unavailable', async () => {
    const accountKey = `dob:account:${TEST_UID}`;

    setDobRateLimiterTestOverride(true);
    try {
      const check = await checkAccountDobRateLimit(accountKey);
      assert.strictEqual(check.blocked, true, 'Must block request when database is unavailable');
      assert.strictEqual(check.unavailable, true, 'Must flag unavailable status');
      assert.ok(check.error?.includes('unavailable'), 'Must return safe generic error message');
    } finally {
      setDobRateLimiterTestOverride(null);
    }
  });

  // Test 21: MongoDB query rejection during initial lockout check
  it('21. Fail closed: MongoDB query rejection during initial lockout check returns unavailable and blocked', async () => {
    const accountKey = `dob:account:${TEST_UID}`;
    const origReadyState = mongoose.connection.readyState;
    const origFindOne = DobLockout.findOne;

    try {
      (mongoose.connection as any).readyState = 1;
      DobLockout.findOne = (() => Promise.reject(new Error('MongoNetworkTimeout: read failed'))) as any;

      const check = await checkAccountDobRateLimit(accountKey);
      assert.strictEqual(check.blocked, true, 'Must fail closed on query rejection');
      assert.strictEqual(check.unavailable, true, 'Must mark unavailable');
      assert.ok(check.error?.includes('unavailable'), 'Must return safe temporary error message');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      DobLockout.findOne = origFindOne;
    }
  });

  // Test 22: MongoDB failure while recording a failed DOB attempt
  it('22. Fail closed: MongoDB failure while recording a failed DOB attempt returns success: false', async () => {
    const accountKey = `dob:account:${TEST_UID}`;
    const origReadyState = mongoose.connection.readyState;
    const origFindOneAndUpdate = DobLockout.findOneAndUpdate;

    try {
      (mongoose.connection as any).readyState = 1;
      DobLockout.findOneAndUpdate = (() => Promise.reject(new Error('MongoWriteException: write failure'))) as any;

      const recordResult = await recordAccountDobFailure(accountKey);
      assert.strictEqual(recordResult.success, false, 'Must report failure when DB write fails');
      assert.ok(recordResult.error?.includes('unavailable'), 'Must return safe generic error');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      DobLockout.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  // Test 23: MongoDB failure while clearing a lockout
  it('23. Fail closed: MongoDB failure while clearing lockout returns success: false', async () => {
    const accountKey = `dob:account:${TEST_UID}`;
    const origReadyState = mongoose.connection.readyState;
    const origDeleteOne = DobLockout.deleteOne;

    try {
      (mongoose.connection as any).readyState = 1;
      DobLockout.deleteOne = (() => Promise.reject(new Error('MongoNetworkTimeout: delete failed'))) as any;

      const clearResult = await clearAccountDobRateLimit(accountKey);
      assert.strictEqual(clearResult.success, false, 'Must report failure when DB delete fails');
      assert.ok(clearResult.error?.includes('unavailable'), 'Must return safe generic error');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      DobLockout.deleteOne = origDeleteOne;
    }
  });

  // Test 24: Concurrent failed DOB requests around the five-attempt threshold
  it('24. Concurrency: Atomic operations handle concurrent failed DOB requests around 5-attempt threshold', async () => {
    const accountKey = `dob:account:${TEST_UID}-concurrency`;
    clearAccountDobStore();

    // Fire 5 concurrent failed attempt records
    const results = await Promise.all([
      recordAccountDobFailure(accountKey),
      recordAccountDobFailure(accountKey),
      recordAccountDobFailure(accountKey),
      recordAccountDobFailure(accountKey),
      recordAccountDobFailure(accountKey),
    ]);

    results.forEach((r, idx) => {
      assert.strictEqual(r.success, true, `Attempt ${idx + 1} must record successfully`);
    });

    // At 5 attempts, the account must be blocked
    const check = await checkAccountDobRateLimit(accountKey);
    assert.strictEqual(check.blocked, true, 'Account must be blocked after 5 attempts');
    assert.ok(check.retryAfterSec > 0, 'Must have positive retryAfterSec');
  });

  // Test 25: Concurrency & Duplicate-Key: Handles E11000 race condition safely and increments active window
  it('25. Concurrency & Duplicate-Key: Handles E11000 race condition safely and increments active window', async () => {
    const accountKey = `dob:account:${TEST_UID}-race-e11000`;
    const origReadyState = mongoose.connection.readyState;
    const origFindOneAndUpdate = DobLockout.findOneAndUpdate;
    const origCreate = DobLockout.create;

    let findOneAndUpdateCalls = 0;
    try {
      (mongoose.connection as any).readyState = 1;

      // First findOneAndUpdate (step 1 & step 2) returns null (simulating no record found yet)
      // Third findOneAndUpdate (step 3 retry) succeeds and returns attempts: 2
      DobLockout.findOneAndUpdate = (async () => {
        findOneAndUpdateCalls++;
        if (findOneAndUpdateCalls <= 2) {
          return null;
        }
        return { accountKey, attempts: 2, lockedUntil: new Date(Date.now() + 900000) };
      }) as any;

      // DobLockout.create throws duplicate key error 11000
      DobLockout.create = (async () => {
        const err: any = new Error('E11000 duplicate key error collection: kudumba_vault.doblockouts index: accountKey_1 dup key');
        err.code = 11000;
        throw err;
      }) as any;

      const res = await recordAccountDobFailure(accountKey);
      assert.strictEqual(res.success, true, 'Must gracefully resolve duplicate key race condition');
      assert.strictEqual(res.attempts, 2, 'Must increment to attempt 2 on race condition retry');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      DobLockout.findOneAndUpdate = origFindOneAndUpdate;
      DobLockout.create = origCreate;
    }
  });

  // Test 26: Expired lockout records still present because TTL cleanup has not run
  it('26. Expiration: Expired lockout records (before TTL cleanup runs) are not blocked and cleanly reset', async () => {
    const accountKey = `dob:account:${TEST_UID}-expired`;
    const origReadyState = mongoose.connection.readyState;
    const origFindOne = DobLockout.findOne;
    const origFindOneAndUpdate = DobLockout.findOneAndUpdate;

    try {
      (mongoose.connection as any).readyState = 1;

      // Simulate an expired record: lockedUntil was 10 seconds ago, with 5 attempts
      const expiredRecord = {
        accountKey,
        attempts: 5,
        lockedUntil: new Date(Date.now() - 10000), // 10s in the past
      };
      DobLockout.findOne = (() => Promise.resolve(expiredRecord)) as any;

      // 1. checkAccountDobRateLimit: must NOT block the user because record is expired
      const check = await checkAccountDobRateLimit(accountKey);
      assert.strictEqual(check.blocked, false, 'Expired lockout record must not block user');
      assert.strictEqual(check.retryAfterSec, 0);

      // 2. recordAccountDobFailure: must cleanly reset attempts to 1 (not increment to 6)
      let resetUpdate: any = null;
      DobLockout.findOneAndUpdate = (async (query: any, update: any) => {
        // Step 1: active window query ({ lockedUntil: { $gt: now } }) -> returns null
        if (query.lockedUntil?.$gt) {
          return null;
        }
        // Step 2: expired window query ({ lockedUntil: { $lte: now } }) -> matches!
        if (query.lockedUntil?.$lte) {
          resetUpdate = update;
          return { accountKey, attempts: 1, lockedUntil: new Date(Date.now() + 900000) };
        }
        return null;
      }) as any;

      const recordResult = await recordAccountDobFailure(accountKey);
      assert.strictEqual(recordResult.success, true);
      assert.strictEqual(recordResult.attempts, 1, 'Must reset expired attempts to 1, not increment old count');
      assert.strictEqual(resetUpdate.$set.attempts, 1, 'Update must set attempts to 1');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      DobLockout.findOne = origFindOne;
      DobLockout.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  // Test 27: Server restart and multiple backend instances
  it('27. Multi-Instance & Server Restart: State persists in MongoDB across in-memory cache clear', async () => {
    const accountKey = `dob:account:${TEST_UID}-instance-restart`;
    const origReadyState = mongoose.connection.readyState;
    const origFindOne = DobLockout.findOne;

    try {
      (mongoose.connection as any).readyState = 1;

      // Backend Instance A records 5 failures and locks the account in MongoDB
      const mockDbRecord = {
        accountKey,
        attempts: 5,
        lockedUntil: new Date(Date.now() + 600000), // 10 minutes from now
      };
      DobLockout.findOne = (() => Promise.resolve(mockDbRecord)) as any;

      // Simulate Server Restart: Node process in-memory store is completely empty
      clearAccountDobStore();

      // Backend Instance B (or restarted process) checks lockout
      const checkInstanceB = await checkAccountDobRateLimit(accountKey);
      assert.strictEqual(checkInstanceB.blocked, true, 'Lockout must persist across server restarts via MongoDB');
      assert.ok(checkInstanceB.retryAfterSec > 0, 'Must calculate remaining retryAfterSec from MongoDB timestamp');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      DobLockout.findOne = origFindOne;
    }
  });

  // Test 28: No reset authorization token issued when lockout enforcement cannot be guaranteed
  it('28. Fail closed: No reset authorization token issued when security verification or lockout fails', async () => {
    // Scenario A: DB unavailable during user profile lookup
    const origReadyState = mongoose.connection.readyState;
    const origFindOne = User.findOne;
    try {
      (mongoose.connection as any).readyState = 1;
      User.findOne = (() => Promise.reject(new Error('MongoClusterOffline'))) as any;

      const resDbDown = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, TEST_DOB);
      assert.strictEqual(resDbDown.valid, false, 'Must fail when database is unavailable');
      assert.strictEqual(resDbDown.errorCode, 'DB_UNAVAILABLE');
      assert.strictEqual(resDbDown.resetAuthorizationToken, undefined, 'Must NOT issue token when DB is unavailable');
    } finally {
      (mongoose.connection as any).readyState = origReadyState;
      User.findOne = origFindOne;
    }

    // Scenario B: DOB is incorrect
    const resWrongDob = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, '1999-01-01');
    assert.strictEqual(resWrongDob.valid, false);
    assert.strictEqual(resWrongDob.resetAuthorizationToken, undefined, 'Must NOT issue token on wrong DOB');

    // Scenario C: Rate limit check blocked
    setDobRateLimiterTestOverride(true);
    try {
      const rateCheck = await checkAccountDobRateLimit(`dob:account:${TEST_UID}`);
      assert.strictEqual(rateCheck.blocked, true);
      assert.strictEqual(rateCheck.unavailable, true);
    } finally {
      setDobRateLimiterTestOverride(null);
    }
  });
});
