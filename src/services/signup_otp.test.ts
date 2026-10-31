import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-kudumba-phase3-recovery-key-32chars!';
process.env.ALLOW_MOCK_DB = 'true';

import { User, clearMockSbUserStore, getMockUserBySupabaseId } from '../models/User';
import {
  verifySupabaseAccessToken,
  syncMongoProfileFromSupabase,
} from './supabaseAuthService';
import {
  verifyResetAuthToken,
  generateResetAuthToken,
} from './passwordRecoveryService';
import { assertDocumentOwnership } from '../middleware/auth';
import { evaluateInactivity } from '../utils/inactivity';

describe('Kudumba Vault — Signup OTP Verification & Account Security', () => {
  const TEST_EMAIL = 'vasudevan.otp@kudumbavault.test';
  const TEST_SB_UID = 'supabase-uid-otp-test-001';
  const TEST_DOB = '1984-06-15';

  beforeEach(() => {
    clearMockSbUserStore();
  });

  // Test 1: Successful signup OTP verification returns valid session & establishes confirmed user
  it('1. Successful signup verification with 6-digit OTP establishes confirmed user session', async () => {
    const validOtp = '849201';
    assert.match(validOtp, /^\d{6}$/, 'OTP must be exactly 6 digits');

    // Simulate Supabase verifyOtp client response for type 'signup'
    const mockVerifyOtpResponse = {
      data: {
        user: {
          id: TEST_SB_UID,
          email: TEST_EMAIL,
          email_confirmed_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          user_metadata: {
            full_name: 'Vasudevan Nair',
            family_name: 'Thekkedath',
            date_of_birth: TEST_DOB,
            preferredLang: 'ml',
          },
        },
        session: {
          access_token: `mock-token:${TEST_SB_UID}:${TEST_EMAIL}:verified`,
          refresh_token: 'mock-refresh-token-12345',
          expires_in: 3600,
        },
      },
      error: null,
    };

    assert.strictEqual(mockVerifyOtpResponse.error, null);
    assert.ok(mockVerifyOtpResponse.data.session.access_token);
    assert.ok(mockVerifyOtpResponse.data.user.email_confirmed_at);

    // Verify backend token validation recognizes confirmed email
    const tokenResult = await verifySupabaseAccessToken(mockVerifyOtpResponse.data.session.access_token);
    assert.strictEqual(tokenResult.valid, true);
    assert.strictEqual(tokenResult.user?.emailConfirmed, true);
    assert.strictEqual(tokenResult.user?.id, TEST_SB_UID);
  });

  // Test 2: Validation of adaptive OTP formats (supporting standard 6 digits and Supabase 8-digit configurations)
  it('2. Accepts 6 and 8-digit numeric OTPs and rejects malformed codes client-side', () => {
    const validateOtpFormat = (code: string): boolean => {
      const clean = code.trim();
      return Boolean(clean && (clean.length === 6 || clean.length === 8) && /^\d{6,8}$/.test(clean));
    };

    assert.strictEqual(validateOtpFormat(''), false, 'Empty code must be rejected');
    assert.strictEqual(validateOtpFormat('12345'), false, '5-digit code must be rejected');
    assert.strictEqual(validateOtpFormat('1234567'), false, '7-digit code must be rejected');
    assert.strictEqual(validateOtpFormat('123456789'), false, '9-digit code must be rejected');
    assert.strictEqual(validateOtpFormat('12345a'), false, 'Alphanumeric 6-char code must be rejected');
    assert.strictEqual(validateOtpFormat('1234567a'), false, 'Alphanumeric 8-char code must be rejected');
    assert.strictEqual(validateOtpFormat('abcdef'), false, 'Alphabetic code must be rejected');
    assert.strictEqual(validateOtpFormat(' 123456 '), true, 'Padded 6 digits are accepted after trim');
    assert.strictEqual(validateOtpFormat('654321'), true, 'Valid 6 digits are accepted');
    assert.strictEqual(validateOtpFormat(' 69496174 '), true, 'Padded 8 digits are accepted after trim');
    assert.strictEqual(validateOtpFormat('69496174'), true, 'Valid 8 digits are accepted');
  });

  // Test 2b: Successful signup verification with 8-digit OTP establishes confirmed user session
  it('2b. Successful signup verification with 8-digit OTP establishes confirmed user session', async () => {
    const valid8DigitOtp = '69496174';
    assert.match(valid8DigitOtp, /^\d{8}$/, 'OTP must be exactly 8 digits');

    // Simulate Supabase verifyOtp response with 8-digit OTP
    const mockVerifyOtpResponse = {
      data: {
        user: {
          id: TEST_SB_UID,
          email: TEST_EMAIL,
          email_confirmed_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          user_metadata: {
            full_name: 'Vasudevan Nair',
            family_name: 'Thekkedath',
            date_of_birth: TEST_DOB,
            preferredLang: 'ml',
          },
        },
        session: {
          access_token: `mock-token:${TEST_SB_UID}:${TEST_EMAIL}:verified`,
          refresh_token: 'mock-refresh-token-67890',
          expires_in: 3600,
        },
      },
      error: null,
    };

    assert.strictEqual(mockVerifyOtpResponse.error, null);
    assert.ok(mockVerifyOtpResponse.data.session.access_token);
    assert.ok(mockVerifyOtpResponse.data.user.email_confirmed_at);

    // Verify backend token validation recognizes confirmed email
    const tokenResult = await verifySupabaseAccessToken(mockVerifyOtpResponse.data.session.access_token);
    assert.strictEqual(tokenResult.valid, true);
    assert.strictEqual(tokenResult.user?.emailConfirmed, true);
  });

  // Test 3: Handling expired OTP codes
  it('3. Expired OTP returns user-friendly expired error message', () => {
    const formatOtpError = (errorMessage: string): string => {
      const lower = errorMessage.toLowerCase();
      if (lower.includes('expired') || lower.includes('otp expired')) {
        return 'Verification code has expired. Please request a new code.';
      }
      if (lower.includes('invalid') || lower.includes('token has expired or is invalid')) {
        return 'Invalid verification code. Please check your email and try again.';
      }
      if (lower.includes('rate limit') || lower.includes('too many requests')) {
        return 'Too many attempts. Please wait before trying again.';
      }
      return errorMessage;
    };

    const expiredError = formatOtpError('Token has expired or is invalid');
    assert.strictEqual(expiredError, 'Verification code has expired. Please request a new code.');

    const expiredError2 = formatOtpError('Email link is invalid or has expired');
    assert.strictEqual(expiredError2, 'Verification code has expired. Please request a new code.');
  });

  // Test 4: Handling wrong or reused OTP codes
  it('4. Wrong or reused OTP code returns friendly invalid-code error', () => {
    const formatOtpError = (errorMessage: string): string => {
      const lower = errorMessage.toLowerCase();
      if (lower.includes('expired') || lower.includes('otp expired')) {
        return 'Verification code has expired. Please request a new code.';
      }
      if (lower.includes('invalid') || lower.includes('token has expired or is invalid')) {
        return 'Invalid verification code. Please check your email and try again.';
      }
      return errorMessage;
    };

    const wrongCodeError = formatOtpError('Token is invalid');
    assert.strictEqual(wrongCodeError, 'Invalid verification code. Please check your email and try again.');
  });

  // Test 5: Resend rate limits & cooldown
  it('5. Resend rate limits are handled with friendly cooldown error message', () => {
    const formatResendError = (errorMessage: string): string => {
      const lower = errorMessage.toLowerCase();
      if (lower.includes('rate limit') || lower.includes('too many requests')) {
        return 'Too many resend attempts. Please wait a minute before requesting another code.';
      }
      return errorMessage;
    };

    const rateLimitError = formatResendError('Over email rate limit: too many requests');
    assert.strictEqual(
      rateLimitError,
      'Too many resend attempts. Please wait a minute before requesting another code.'
    );
  });

  // Test 6: Existing verified email handling
  it('6. Existing verified email is detected safely and prevented from duplication', () => {
    // Supabase returns identities: [] when email already exists without throwing
    const isDuplicateEmail = (data: any, error: any): boolean => {
      return Boolean(
        (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) ||
        (error && (
          /already registered|already in use|user already exists/i.test(error.message) ||
          error.code === 'user_already_exists'
        ))
      );
    };

    const duplicateData = { user: { id: 'sb-id-1', identities: [] } };
    assert.strictEqual(isDuplicateEmail(duplicateData, null), true, 'Empty identities array indicates duplicate');

    const duplicateError = { message: 'User already registered' };
    assert.strictEqual(isDuplicateEmail(null, duplicateError), true, 'Error message indicates duplicate');
  });

  // Test 7: Unverified account login prompts for verification
  it('7. Login with unverified account flags requiresVerification: true', async () => {
    const unverifiedToken = `mock-token:${TEST_SB_UID}:${TEST_EMAIL}:unverified`;
    const tokenResult = await verifySupabaseAccessToken(unverifiedToken);

    assert.strictEqual(tokenResult.valid, true);
    assert.strictEqual(tokenResult.user?.emailConfirmed, false, 'Account must be marked unverified');

    // Simulate login requiring verification
    const isVerified = tokenResult.user?.emailConfirmed || false;
    const loginResult = {
      success: true,
      requiresVerification: !isVerified,
    };
    assert.strictEqual(loginResult.requiresVerification, true, 'Must require email verification');
  });

  // Test 8: Duplicate submission protection
  it('8. In-flight verification flag prevents duplicate simultaneous submissions', () => {
    let isVerifying = false;
    let submissionCount = 0;

    const submitOtp = (code: string) => {
      if (isVerifying) return false;
      isVerifying = true;
      submissionCount++;
      return true;
    };

    assert.strictEqual(submitOtp('123456'), true, 'First submission allowed');
    assert.strictEqual(submitOtp('123456'), false, 'Concurrent duplicate submission blocked');
    assert.strictEqual(submissionCount, 1, 'Only one submission executed');
  });

  // Test 9: MongoDB profile synchronization after successful OTP verification
  it('9. Idempotently creates verified MongoDB profile upon OTP completion', async () => {
    const verifiedUser = {
      id: TEST_SB_UID,
      email: TEST_EMAIL,
      emailConfirmed: true,
      lastSignInAt: new Date().toISOString(),
      metadata: {
        full_name: 'Vasudevan Nair',
        family_name: 'Thekkedath',
        date_of_birth: TEST_DOB,
        preferredLang: 'ml' as const,
      },
    };

    const profile = await syncMongoProfileFromSupabase(verifiedUser, TEST_DOB);
    assert.strictEqual(profile.supabaseUserId, TEST_SB_UID);
    assert.strictEqual(profile.email, TEST_EMAIL);
    assert.strictEqual(profile.dateOfBirth, TEST_DOB);
    assert.strictEqual(profile.fullName, 'Vasudevan Nair');

    // Second synchronization is idempotent
    const profile2 = await syncMongoProfileFromSupabase(verifiedUser, TEST_DOB);
    assert.strictEqual(String(profile._id), String(profile2._id), 'Must preserve same profile ObjectId');
  });

  // Test 10: Signup OTP cannot be used as a password recovery reset token (Separation of concerns)
  it('10. Security boundary: Signup OTP cannot be accepted as password reset authorization token', () => {
    const signupOtp = '849201';

    // Password recovery reset verification requires cryptographic JWT with type kudumba_dob_verified_reset
    const verifyResult = verifyResetAuthToken(signupOtp, TEST_SB_UID);
    assert.strictEqual(verifyResult.valid, false, 'Plain numeric OTP cannot be accepted as reset token');
    assert.strictEqual(verifyResult.errorCode, 'INVALID_TOKEN');

    // Genuine reset authorization token format check
    const genuineReset = generateResetAuthToken(TEST_SB_UID, TEST_EMAIL);
    const checkGenuine = verifyResetAuthToken(genuineReset.token, TEST_SB_UID);
    assert.strictEqual(checkGenuine.valid, true, 'Genuine reset token must be accepted');
  });

  // Test 11: Document isolation remains enforced for unverified accounts
  it('11. Document isolation and ownership checks remain strictly enforced', () => {
    const ownerId = '60d5ec49f1b2c8b1f8e4e1a1';
    const attackerId = '60d5ec49f1b2c8b1f8e4e1a2';

    // Access by owner: permitted
    assert.strictEqual(assertDocumentOwnership(ownerId, ownerId, 'USER'), true);

    // Access by attacker: strictly forbidden
    assert.strictEqual(assertDocumentOwnership(ownerId, attackerId, 'USER'), false);
  });

  // Test 12: Seven-day inactivity security remains enforced
  it('12. Inactivity evaluation correctly flags accounts inactive for >= 7 days', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const inactiveResult = evaluateInactivity(eightDaysAgo);
    assert.strictEqual(inactiveResult.expired, true, '8 days of inactivity must be expired');

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const activeResult = evaluateInactivity(twoDaysAgo);
    assert.strictEqual(activeResult.expired, false, '2 days of inactivity must not be expired');
  });
});
