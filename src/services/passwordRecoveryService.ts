import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { getJwtSecret } from './authService';
import { User, getMockUserBySupabaseId, isMockDbAllowed } from '../models/User';
import { ConsumedResetToken } from '../models/ConsumedResetToken';
import { validateDateOfBirth } from '../utils/dobValidation';
import { getSupabaseStorageClient } from './supabaseStorage';

// Replay defense: Set of consumed one-time-use reset authorization token IDs (jti)
const usedResetTokens = new Set<string>();

export function clearUsedResetTokens(): void {
  usedResetTokens.clear();
}

export interface ResetAuthTokenPayload {
  sub: string; // supabaseUserId
  email: string;
  type: 'kudumba_dob_verified_reset';
  jti: string; // unique single-use nonce
}

export interface VerifyDobResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  resetAuthorizationToken?: string;
  expiresIn?: number;
}

/**
 * Generates a short-lived (10 minutes), cryptographically signed one-time-use token
 * proving that the user successfully passed Step 2 Date-of-Birth verification.
 */
export function generateResetAuthToken(supabaseUserId: string, email: string): { token: string; expiresIn: number } {
  const secret = getJwtSecret();
  const jti = crypto.randomUUID();
  const expiresIn = 600; // 10 minutes in seconds

  const payload: ResetAuthTokenPayload = {
    sub: supabaseUserId,
    email: email.trim().toLowerCase(),
    type: 'kudumba_dob_verified_reset',
    jti,
  };

  const options: SignOptions = {
    expiresIn,
    issuer: 'kudumba-vault-api',
    audience: 'kudumba-vault-recovery',
  };

  const token = jwt.sign(payload, secret, options);
  return { token, expiresIn };
}

/**
 * Validates a reset authorization token for Step 3 password update.
 * Enforces cryptographic signature, expiration, token type, and single-use replay defense.
 */
export function verifyResetAuthToken(
  token: string,
  expectedSupabaseUserId: string
): { valid: boolean; jti?: string; error?: string; errorCode?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Reset authorization token is missing or malformed.', errorCode: 'INVALID_TOKEN' };
  }

  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token.trim(), secret, {
      issuer: 'kudumba-vault-api',
      audience: 'kudumba-vault-recovery',
    }) as ResetAuthTokenPayload;

    if (!decoded || decoded.type !== 'kudumba_dob_verified_reset') {
      return { valid: false, error: 'Invalid reset authorization token type.', errorCode: 'INVALID_TOKEN' };
    }

    // Cross-account protection: ensure the token belongs strictly to the authenticated recovery user
    if (decoded.sub !== expectedSupabaseUserId) {
      return {
        valid: false,
        error: 'Reset authorization does not match the active recovery session.',
        errorCode: 'CROSS_ACCOUNT_FORBIDDEN',
      };
    }

    // Replay defense: verify token has not been previously consumed
    if (usedResetTokens.has(decoded.jti)) {
      return {
        valid: false,
        error: 'Reset authorization has already been used. Please request a new recovery link.',
        errorCode: 'TOKEN_ALREADY_USED',
      };
    }

    return { valid: true, jti: decoded.jti };
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        error: 'Reset authorization has expired. Please verify your date of birth again.',
        errorCode: 'EXPIRED_TOKEN',
      };
    }
    return {
      valid: false,
      error: 'Invalid or forged reset authorization token.',
      errorCode: 'INVALID_TOKEN',
    };
  }
}

/**
 * Marks a reset authorization token as consumed to prevent replay attacks.
 * Persists in MongoDB when connected, and maintains an in-memory set cache.
 */
export function consumeResetAuthToken(jti: string, supabaseUserId = 'unknown'): void {
  usedResetTokens.add(jti);
  if (mongoose.connection.readyState === 1) {
    ConsumedResetToken.create({
      jti,
      supabaseUserId,
      consumedAt: new Date(),
    }).catch(() => {});
  }
  // Optional self-cleanup after 15 minutes to bound memory usage
  setTimeout(() => {
    usedResetTokens.delete(jti);
  }, 15 * 60 * 1000).unref();
}

/**
 * Atomically verifies and consumes a reset authorization token.
 * Combines signature validation, cross-account checks, and persistent unique-index insertion into an atomic operation.
 * Guarantees that concurrent requests cannot consume the same token simultaneously (race condition immunity),
 * and ensures replay defense survives process restarts and works across multiple backend instances via MongoDB Atlas.
 */
export async function consumeResetAuthTokenAtomic(
  token: string,
  expectedSupabaseUserId: string
): Promise<{ valid: boolean; jti?: string; error?: string; errorCode?: string }> {
  // 1. Synchronous verification of signature, format, expiration, and cross-account match
  const syncCheck = verifyResetAuthToken(token, expectedSupabaseUserId);
  if (!syncCheck.valid || !syncCheck.jti) {
    return syncCheck;
  }

  const jti = syncCheck.jti;

  // 2. Fast-path in-memory check
  if (usedResetTokens.has(jti)) {
    return {
      valid: false,
      error: 'Reset authorization has already been used. Please request a new recovery link.',
      errorCode: 'TOKEN_ALREADY_USED',
    };
  }

  // 3. Persistent atomic insert into MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await ConsumedResetToken.create({
        jti,
        supabaseUserId: expectedSupabaseUserId,
        consumedAt: new Date(),
      });
      usedResetTokens.add(jti);
    } catch (err: any) {
      if (err.code === 11000 || err.message?.includes('duplicate key')) {
        return {
          valid: false,
          error: 'Reset authorization has already been used. Please request a new recovery link.',
          errorCode: 'TOKEN_ALREADY_USED',
        };
      }
      // Fail closed: Never permit password updates when persistent token storage cannot verify replay defense
      return {
        valid: false,
        error: 'Database service is currently unavailable. Password reset cannot be safely authorized.',
        errorCode: 'DB_UNAVAILABLE',
      };
    }
  } else {
    usedResetTokens.add(jti);
  }

  return { valid: true, jti };
}

/**
 * Step 2: Validates the user's submitted Date of Birth against their stored profile.
 * Selects profile exclusively by the authenticated Supabase User ID (never client-supplied ID).
 * Returns generic error without revealing stored date or account details.
 */
export async function verifyRecoveryDateOfBirth(
  supabaseUserId: string,
  userEmail: string,
  submittedDob?: string
): Promise<VerifyDobResult> {
  const GENERIC_ERROR = 'Invalid date of birth provided.';

  if (!submittedDob || typeof submittedDob !== 'string') {
    return { valid: false, error: GENERIC_ERROR };
  }

  const dobValidation = validateDateOfBirth(submittedDob);
  if (!dobValidation.valid || !dobValidation.normalized) {
    return { valid: false, error: GENERIC_ERROR };
  }

  const normalizedInput = dobValidation.normalized;
  let storedDob: string | undefined = undefined;

  if (mongoose.connection.readyState === 1) {
    try {
      let user = await User.findOne({ supabaseUserId });
      if (!user) {
        // Fallback: Check Supabase Auth and reconcile orphaned user profile on the fly
        const supabaseAdmin = getSupabaseStorageClient();
        if (supabaseAdmin?.auth?.admin?.getUserById) {
          const { data: sbData, error: sbErr } = await supabaseAdmin.auth.admin.getUserById(supabaseUserId);
          if (!sbErr && sbData?.user) {
            const sbUser = sbData.user;
            const sbDob = sbUser.user_metadata?.date_of_birth || sbUser.user_metadata?.dateOfBirth;
            try {
              user = await User.findOrCreateBySupabaseUser({
                supabaseUserId: sbUser.id,
                email: sbUser.email || userEmail,
                fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.fullName,
                familyName: sbUser.user_metadata?.family_name || sbUser.user_metadata?.familyName,
                dateOfBirth: sbDob,
                preferredLang: sbUser.user_metadata?.preferredLang || 'ml',
                isEmailVerified: Boolean(sbUser.email_confirmed_at || (sbUser as any).confirmed_at),
              });
            } catch (createErr) {
              console.warn('[Recovery] On-the-fly user profile creation notice:', createErr);
            }
            if (!storedDob && sbDob) {
              storedDob = sbDob;
            }
          }
        }
      }
      if (user && user.dateOfBirth) {
        storedDob = user.dateOfBirth;
      }
      if (!storedDob) {
        return { valid: false, error: GENERIC_ERROR };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Recovery] User lookup error during DOB verification:', msg);
      return {
        valid: false,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
        errorCode: 'DB_UNAVAILABLE',
      };
    }
  } else {
    // In-memory test store lookup when explicitly permitted
    if (!isMockDbAllowed()) {
      return {
        valid: false,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
        errorCode: 'DB_UNAVAILABLE',
      };
    }
    const mockUser = getMockUserBySupabaseId(supabaseUserId);
    if (!mockUser) {
      return { valid: false, error: GENERIC_ERROR };
    }
    storedDob = mockUser.dateOfBirth;
  }

  if (!storedDob) {
    return { valid: false, error: GENERIC_ERROR };
  }

  // Consistent string comparison in normalized YYYY-MM-DD calendar format
  if (storedDob.trim() !== normalizedInput) {
    return { valid: false, error: GENERIC_ERROR };
  }

  // Success: Generate short-lived reset authorization token
  const { token, expiresIn } = generateResetAuthToken(supabaseUserId, userEmail);
  return {
    valid: true,
    resetAuthorizationToken: token,
    expiresIn,
  };
}
