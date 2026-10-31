import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { verifySupabaseAccessToken, syncMongoProfileFromSupabase } from '../services/supabaseAuthService';
import { AuthUserPayload, verifyAuthToken } from '../services/authService';
import { User } from '../models/User';
import { evaluateInactivity, isQualifyingActivity } from '../utils/inactivity';
import { ensureDatabaseConnected } from '../config/db';

export interface KudumbaAuthUser {
  id: string; // MongoDB User _id string (used as ownerId across documents)
  supabaseUserId?: string; // Supabase Auth UID
  email: string;
  role: string;
  isEmailVerified: boolean;
}

// Extend Express Request type to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: KudumbaAuthUser;
    }
  }
}

/**
 * Parses raw Cookie header string into key-value pairs without extra dependencies.
 */
export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Extracts Bearer token or HttpOnly cookie from request.
 */
export function extractTokenFromRequest(req: Request): string | undefined {
  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Check cookies: sb-access-token, kv_token, or Supabase auth cookie
  if (req.headers.cookie) {
    const cookies = parseCookieHeader(req.headers.cookie);
    if (cookies['sb-access-token']) return cookies['sb-access-token'];
    if (cookies.kv_token) return cookies.kv_token;
  }

  return undefined;
}

/**
 * Core Authentication & Authorization Middleware.
 * Validates Supabase access token via official Supabase Auth.
 * Enforces mandatory email confirmation for all protected vault operations.
 * Resolves or idempotently creates the MongoDB user profile.
 */
let lastDbUnavailableLogTime = 0;

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractTokenFromRequest(req);

  if (!token) {
    res.status(401).json({
      ok: false,
      error: 'Authentication required. Please sign in to access your Kudumba Vault.',
    });
    return;
  }

  // 1. Test environment legacy JWT support for existing test suites
  if (process.env.NODE_ENV === 'test' && !token.startsWith('sb-') && !token.startsWith('mock-')) {
    try {
      const payload = verifyAuthToken(token);
      req.user = {
        id: payload.id,
        supabaseUserId: `sb-${payload.id}`,
        email: payload.email,
        role: payload.role,
        isEmailVerified: true,
      };
      return await (next as any)();
    } catch {
      // Proceed to Supabase verification
    }
  }

  // 2. Official Supabase Token Verification
  const result = await verifySupabaseAccessToken(token);

  if (!result.valid || !result.user) {
    res.status(401).json({
      ok: false,
      error: result.error || 'Invalid or expired session. Please sign in again.',
      errorCode: result.errorCode || 'INVALID_TOKEN',
    });
    return;
  }

  // 3. Mandatory Email Verification Check
  if (!result.user.emailConfirmed) {
    res.status(403).json({
      ok: false,
      error: 'Email verification required. Please check your inbox and verify your email to access Kudumba Vault.',
      requiresVerification: true,
      email: result.user.email,
    });
    return;
  }

  // 4. Resolve MongoDB Profile
  try {
    if (mongoose.connection.readyState !== 1) {
      await ensureDatabaseConnected();
    }
    const mongoUser = await syncMongoProfileFromSupabase(result.user);

    // 5. Seven-Day Inactivity Security Check (Phase 2)
    const inactivity = evaluateInactivity(mongoUser.lastActivityAt);
    if (inactivity.expired) {
      res.status(401).json({
        ok: false,
        error: 'Session expired due to 7 consecutive days of inactivity. Please sign in again to unlock your Kudumba Vault.',
        errorCode: 'INACTIVITY_TIMEOUT',
        requiresReauth: true,
        lastActivityAt: mongoUser.lastActivityAt,
        inactiveDays: Math.floor(inactivity.inactiveMs / (24 * 60 * 60 * 1000)),
      });
      return;
    }

    req.user = {
      id: mongoUser._id.toString(),
      supabaseUserId: result.user.id,
      email: result.user.email,
      role: mongoUser.role || 'USER',
      isEmailVerified: true,
    };

    // 6. Record qualifying meaningful activity (server-side timestamp)
    if (isQualifyingActivity(req)) {
      User.recordActivity(mongoUser._id.toString()).catch((err) => {
        // Non-blocking activity update error
      });
    }

    await (next as any)();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to synchronize user profile.';
    const isDbUnavailable =
      msg.includes('Database') &&
      (msg.includes('unavailable') || msg.includes('not connected') || msg.includes('connection'));
    if (isDbUnavailable) {
      const now = Date.now();
      if (now - lastDbUnavailableLogTime > 10000) {
        lastDbUnavailableLogTime = now;
        console.error('[Auth] Database unavailable during auth profile sync:', msg);
      }
      res.status(503).json({
        ok: false,
        error: 'Database service is currently unavailable. Please ensure MongoDB is connected.',
      });
      return;
    }
    res.status(500).json({ ok: false, error: msg });
  }
}

/**
 * Household Authentication middleware.
 * Strictly enforces Supabase Auth verification and mandatory email confirmation
 * across all vault document, family member, worker, and share pack operations.
 */
export async function householdAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  return requireAuth(req, res, next);
}

/**
 * Checks whether the authenticated user owns the document or has admin privilege.
 * Strictly prevents Insecure Direct Object Reference (IDOR) attacks.
 */
export function assertDocumentOwnership(
  documentOwnerId: string | { toString(): string },
  currentUserId?: string,
  currentUserRole?: string
): boolean {
  if (!currentUserId) return false;
  const ownerStr = typeof documentOwnerId === 'string' ? documentOwnerId : documentOwnerId.toString();

  // Owners always have access
  if (ownerStr === currentUserId) return true;

  // Admins can be permitted if specified by role
  if (currentUserRole === 'ADMIN') return true;

  return false;
}
