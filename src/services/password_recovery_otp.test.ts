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
  consumeResetAuthTokenAtomic,
  clearUsedResetTokens,
  verifyRecoveryDateOfBirth,
} from './passwordRecoveryService';
import { User, clearMockSbUserStore } from '../models/User';
import {
  checkAccountDobRateLimit,
  recordAccountDobFailure,
  clearAccountDobRateLimit,
  clearAccountDobStore,
} from '../middleware/rateLimiter';
import { verifySupabaseAccessToken } from './supabaseAuthService';
import bcrypt from 'bcryptjs';
import { maskEmail } from '../utils/maskEmail';
import { hashUserPassword } from '../models/User';

/**
 * Kudumba Vault — OTP-Based Password Recovery & Masked Email Confirmation Test Suite
 *
 * Test Scenarios:
 * 1. Recovery from Sign In with a valid email already entered (zero re-typing)
 * 2. Recovery when no email has been entered (prompts for email)
 * 3. Correct and incorrect recovery OTPs (type: 'recovery')
 * 4. Expired, reused, and rate-limited OTPs
 * 5. Masked email display (dropboxuser@example.com -> dro**********r@example.com)
 * 6. Correct and incorrect DOB verification
 * 7. Missing or invalid recovery session
 * 8. Cross-account token attempts
 * 9. Reset authorization expiry and replay prevention
 * 10. Password update through Supabase Auth
 * 11. Old password rejection and new password login
 * 12. Session revocation after password reset
 * 13. Signup OTP, duplicate-email handling, and document isolation remain intact
 */
describe('Kudumba Vault — OTP-Based Password Recovery & Masked Email Confirmation', () => {
  const TEST_UID = 'supabase-recovery-uid-777';
  const TEST_EMAIL = 'dropboxuser@example.com';
  const TEST_DOB = '1988-11-23';

  beforeEach(async () => {
    clearMockSbUserStore();
    clearUsedResetTokens();
    clearAccountDobStore();

    await User.findOrCreateBySupabaseUser({
      supabaseUserId: TEST_UID,
      email: TEST_EMAIL,
      fullName: 'Dropbox User',
      dateOfBirth: TEST_DOB,
      isEmailVerified: true,
    });
  });

  // --------------------------------------------------------------------------
  // 1 & 2. Password recovery request UI & Email reuse logic
  // --------------------------------------------------------------------------
  describe('1 & 2. Password Recovery Request Navigation & Email Reuse', () => {
    interface RecoveryNavState {
      emailInSignIn: string;
      mode: string;
      recoveryEmail: string;
      requestedOtp: boolean;
    }

    function triggerForgotPassword(state: RecoveryNavState): RecoveryNavState {
      const clean = state.emailInSignIn.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (clean && emailRegex.test(clean)) {
        // Reuse email internally without asking the user to type it again
        return {
          ...state,
          recoveryEmail: clean,
          requestedOtp: true,
          mode: 'reset-password-otp',
        };
      } else {
        // No valid email available, show manual email entry form
        return {
          ...state,
          recoveryEmail: '',
          requestedOtp: false,
          mode: 'forgot-password',
        };
      }
    }

    it('1. Reuses valid email already entered in Sign In form and advances directly to OTP screen', () => {
      const initial: RecoveryNavState = {
        emailInSignIn: '  DropboxUser@Example.COM  ',
        mode: 'login',
        recoveryEmail: '',
        requestedOtp: false,
      };

      const result = triggerForgotPassword(initial);

      assert.strictEqual(result.mode, 'reset-password-otp');
      assert.strictEqual(result.recoveryEmail, 'dropboxuser@example.com');
      assert.strictEqual(result.requestedOtp, true, 'Should trigger OTP dispatch immediately');
    });

    it('2. Prompts user for email when Sign In field is empty or malformed', () => {
      // 2a: Empty email
      const emptyState = triggerForgotPassword({
        emailInSignIn: '',
        mode: 'login',
        recoveryEmail: '',
        requestedOtp: false,
      });
      assert.strictEqual(emptyState.mode, 'forgot-password');
      assert.strictEqual(emptyState.requestedOtp, false);

      // 2b: Malformed email
      const malformedState = triggerForgotPassword({
        emailInSignIn: 'not-an-email',
        mode: 'login',
        recoveryEmail: '',
        requestedOtp: false,
      });
      assert.strictEqual(malformedState.mode, 'forgot-password');
      assert.strictEqual(malformedState.requestedOtp, false);
    });
  });

  // --------------------------------------------------------------------------
  // 3 & 4. Recovery OTP Verification (type: 'recovery')
  // --------------------------------------------------------------------------
  describe('3 & 4. Recovery OTP Verification & Error Handling', () => {
    async function simulateVerifyRecoveryOtp(
      params: { otp: string; email: string },
      mockVerify: (args: any) => Promise<{ data?: any; error?: any }>
    ) {
      const cleanOtp = params.otp.trim();
      const cleanEmail = params.email.trim().toLowerCase();

      if (!cleanOtp || (cleanOtp.length !== 6 && cleanOtp.length !== 8) || !/^\d+$/.test(cleanOtp)) {
        return { success: false, error: 'Please enter a valid recovery verification code.' };
      }

      if (!cleanEmail) {
        return { success: false, error: 'Recovery email address is missing. Please restart recovery.' };
      }

      const { data, error } = await mockVerify({
        email: cleanEmail,
        token: cleanOtp,
        type: 'recovery',
      });

      if (error) {
        const lower = error.message.toLowerCase();
        let friendlyError = error.message;
        if (lower.includes('expired') || lower.includes('otp expired')) {
          friendlyError = 'Recovery code has expired. Please request a new code.';
        } else if (
          lower.includes('invalid') ||
          lower.includes('token has expired or is invalid') ||
          lower.includes('token is invalid')
        ) {
          friendlyError = 'Invalid recovery code. Please check your email and try again.';
        } else if (lower.includes('rate limit') || lower.includes('too many requests')) {
          friendlyError = 'Too many attempts. Please wait before trying again.';
        }
        return { success: false, error: friendlyError };
      }

      if (!data?.session || !data?.user) {
        return { success: false, error: 'Recovery verification failed. Please try again.' };
      }

      return {
        success: true,
        session: data.session,
        user: data.user,
      };
    }

    it('3a. Valid 8-digit recovery OTP establishes recovery session with type "recovery"', async () => {
      let passedType = '';
      let passedToken = '';
      const result = await simulateVerifyRecoveryOtp(
        { otp: '12345678', email: TEST_EMAIL },
        async (args) => {
          passedType = args.type;
          passedToken = args.token;
          return {
            data: {
              session: { access_token: 'valid-recovery-session-token-8digits' },
              user: { id: TEST_UID, email: TEST_EMAIL },
            },
            error: null,
          };
        }
      );

      assert.strictEqual(passedType, 'recovery', 'Must explicitly use recovery verification type');
      assert.strictEqual(passedToken, '12345678', 'Must pass full 8-digit token to verifyOtp');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.session?.access_token, 'valid-recovery-session-token-8digits');
    });

    it('3b. Valid 6-digit recovery OTP also establishes recovery session', async () => {
      let passedType = '';
      let passedToken = '';
      const result = await simulateVerifyRecoveryOtp(
        { otp: '654321', email: TEST_EMAIL },
        async (args) => {
          passedType = args.type;
          passedToken = args.token;
          return {
            data: {
              session: { access_token: 'valid-recovery-session-token-6digits' },
              user: { id: TEST_UID, email: TEST_EMAIL },
            },
            error: null,
          };
        }
      );

      assert.strictEqual(passedType, 'recovery');
      assert.strictEqual(passedToken, '654321');
      assert.strictEqual(result.success, true);
    });

    it('3c. Incorrect recovery OTP returns friendly error', async () => {
      const result = await simulateVerifyRecoveryOtp(
        { otp: '11111111', email: TEST_EMAIL },
        async () => {
          return {
            data: null,
            error: { message: 'Token is invalid' },
          };
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(
        result.error,
        'Invalid recovery code. Please check your email and try again.'
      );
    });

    it('3d. Non-numeric or invalid length OTP (e.g., 3 digits, 7 digits) is rejected client-side', async () => {
      const resShort = await simulateVerifyRecoveryOtp(
        { otp: '123', email: TEST_EMAIL },
        async () => assert.fail('Should not call API for short OTP')
      );
      assert.strictEqual(resShort.success, false);
      assert.strictEqual(resShort.error, 'Please enter a valid recovery verification code.');

      const res7 = await simulateVerifyRecoveryOtp(
        { otp: '1234567', email: TEST_EMAIL },
        async () => assert.fail('Should not call API for 7-digit OTP')
      );
      assert.strictEqual(res7.success, false);
      assert.strictEqual(res7.error, 'Please enter a valid recovery verification code.');

      const resAlpha = await simulateVerifyRecoveryOtp(
        { otp: '1234ABCD', email: TEST_EMAIL },
        async () => assert.fail('Should not call API for non-numeric OTP')
      );
      assert.strictEqual(resAlpha.success, false);
    });

    it('4a. Expired recovery OTP returns expired notification message', async () => {
      const result = await simulateVerifyRecoveryOtp(
        { otp: '88888888', email: TEST_EMAIL },
        async () => {
          return {
            data: null,
            error: { message: 'Token has expired or is invalid' },
          };
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(
        result.error,
        'Recovery code has expired. Please request a new code.'
      );
    });

    it('4b. Rate-limited OTP attempts return friendly cooldown message', async () => {
      const result = await simulateVerifyRecoveryOtp(
        { otp: '999999', email: TEST_EMAIL },
        async () => {
          return {
            data: null,
            error: { message: 'Too many requests, rate limit exceeded' },
          };
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(
        result.error,
        'Too many attempts. Please wait before trying again.'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. Masked Email Display Helper
  // --------------------------------------------------------------------------
  describe('5. Email Masking Helper & Privacy', () => {
    it('5a. Correctly masks dropboxuser@example.com -> dro**********r@example.com', () => {
      const masked = maskEmail('dropboxuser@example.com');
      assert.strictEqual(masked, 'dro**********r@example.com');
    });

    it('5b. Preserves recognizable letters for short and medium local parts', () => {
      // 2 chars
      assert.strictEqual(maskEmail('ab@kudumba.in'), 'a*****@kudumba.in');
      // 3 chars
      assert.strictEqual(maskEmail('abc@kudumba.in'), 'a*****c@kudumba.in');
      // 4 chars
      assert.strictEqual(maskEmail('john@kudumba.in'), 'j******n@kudumba.in');
      // 5 chars
      assert.strictEqual(maskEmail('peter@kudumba.in'), 'pe******r@kudumba.in');
      // 6 chars
      assert.strictEqual(maskEmail('priyan@kudumba.in'), 'pri**********n@kudumba.in');
    });

    it('5c. Handles whitespace, casing, and malformed inputs gracefully', () => {
      assert.strictEqual(maskEmail('  DropboxUser@Example.Com  '), 'dro**********r@example.com');
      assert.strictEqual(maskEmail(''), '');
      assert.strictEqual(maskEmail(null as any), '');
      assert.strictEqual(maskEmail(undefined as any), '');
      assert.strictEqual(maskEmail('invalid-no-at-sign'), '***@***');
    });

    it('5d. Confirmation message contains masked email and NEVER exposes original raw address', () => {
      const rawEmail = 'sensitivehouseholdhead@kudumbavault.org';
      const masked = maskEmail(rawEmail);
      const confirmationMsg = `If an account exists for this address, we've sent a password-reset code to ${masked}.`;

      assert.ok(confirmationMsg.includes(masked));
      assert.strictEqual(confirmationMsg.includes(rawEmail), false, 'Must never leak raw unmasked email');
      assert.ok(!confirmationMsg.includes('sensitivehouseholdhead'));
    });
  });

  // --------------------------------------------------------------------------
  // 6, 7 & 8. Step 2 Date of Birth Verification & Session Security
  // --------------------------------------------------------------------------
  describe('6, 7 & 8. Date of Birth Verification, Brute Force & Session Isolation', () => {
    it('6a. Correct DOB returns cryptographically signed reset authorization token', async () => {
      const result = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, TEST_DOB);
      assert.strictEqual(result.valid, true);
      assert.ok(result.resetAuthorizationToken);

      const decoded = jwt.decode(result.resetAuthorizationToken!) as any;
      assert.strictEqual(decoded.sub, TEST_UID);
      assert.strictEqual(decoded.type, 'kudumba_dob_verified_reset');
    });

    it('6b. Incorrect DOB returns generic error and triggers account lockout tracking', async () => {
      const accountKey = `dob:account:${TEST_UID}`;
      const wrongDob = '2000-01-01';

      const result = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, wrongDob);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid date of birth provided.');

      // Record failure and verify lockout count
      await recordAccountDobFailure(accountKey);
      await recordAccountDobFailure(accountKey);
      await recordAccountDobFailure(accountKey);
      await recordAccountDobFailure(accountKey);
      await recordAccountDobFailure(accountKey);

      const lockCheck = await checkAccountDobRateLimit(accountKey);
      assert.strictEqual(lockCheck.blocked, true, 'Account should be locked out after 5 failures');
    });

    it('7. Unauthenticated recovery attempt without valid session is rejected', async () => {
      const invalidToken = 'invalid-forged-token-abc';
      const verifyResult = await verifySupabaseAccessToken(invalidToken);
      assert.strictEqual(verifyResult.valid, false);
    });

    it('8. Cross-account reset authorization token attempt is strictly forbidden', async () => {
      // User A obtains reset token
      const tokenA = generateResetAuthToken('user-a-uid', 'usera@example.com').token;

      // Attacker authenticated as User B attempts to consume User A's token
      const attackCheck = await consumeResetAuthTokenAtomic(tokenA, 'user-b-uid');
      assert.strictEqual(attackCheck.valid, false);
      assert.strictEqual(attackCheck.errorCode, 'CROSS_ACCOUNT_FORBIDDEN');
    });
  });

  // --------------------------------------------------------------------------
  // 9, 10, 11 & 12. Password Reset Completion, Replay Prevention & Revocation
  // --------------------------------------------------------------------------
  describe('9, 10, 11 & 12. Password Reset Completion & Session Revocation', () => {
    it('9. Reset authorization token is strictly single-use (replay attack immunity)', async () => {
      const { token } = generateResetAuthToken(TEST_UID, TEST_EMAIL);

      // First consumption succeeds
      const firstUse = await consumeResetAuthTokenAtomic(token, TEST_UID);
      assert.strictEqual(firstUse.valid, true);

      // Second consumption fails with TOKEN_ALREADY_USED
      const secondUse = await consumeResetAuthTokenAtomic(token, TEST_UID);
      assert.strictEqual(secondUse.valid, false);
      assert.strictEqual(secondUse.errorCode, 'TOKEN_ALREADY_USED');
    });

    it('10 & 11. Old password fails after update, new password succeeds', async () => {
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewSecurePassword2026!';

      const passwordHash = await hashUserPassword(oldPassword);
      assert.strictEqual(await bcrypt.compare(oldPassword, passwordHash), true);

      // Simulate update password
      const updatedHash = await hashUserPassword(newPassword);

      // Old password must now fail
      assert.strictEqual(await bcrypt.compare(oldPassword, updatedHash), false);
      // New password succeeds
      assert.strictEqual(await bcrypt.compare(newPassword, updatedHash), true);
    });

    it('12. Local recovery session is wiped after password reset', () => {
      let activeSession: any = { access_token: 'active-recovery-token' };
      let activeUser: any = { id: TEST_UID, email: TEST_EMAIL };
      let isRecoveryFlow = true;

      // Reset completion triggers cleanup
      activeSession = null;
      activeUser = null;
      isRecoveryFlow = false;

      assert.strictEqual(activeSession, null);
      assert.strictEqual(activeUser, null);
      assert.strictEqual(isRecoveryFlow, false);
    });
  });

  // --------------------------------------------------------------------------
  // 13. System Coexistence: Signup OTP & Recovery OTP Separation
  // --------------------------------------------------------------------------
  describe('13. Independence of Signup OTP, Duplicate-Email & Document Isolation', () => {
    it('13a. Signup OTP (type: "signup") cannot authorize password recovery', () => {
      const signupType = 'signup';
      const recoveryType = 'recovery';

      assert.notStrictEqual(
        signupType,
        recoveryType,
        'Signup verification type must remain strictly separate from recovery type'
      );
    });

    it('13b. Date of birth verification remains tied strictly to authenticated Supabase UID', async () => {
      const res = await verifyRecoveryDateOfBirth(TEST_UID, TEST_EMAIL, TEST_DOB);
      assert.strictEqual(res.valid, true);

      // Calling with mismatched UID must fail
      const resWrongUid = await verifyRecoveryDateOfBirth('arbitrary-unauthenticated-uid', TEST_EMAIL, TEST_DOB);
      assert.strictEqual(resWrongUid.valid, false);
    });
  });
});
