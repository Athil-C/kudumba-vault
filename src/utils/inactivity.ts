/**
 * Kudumba Vault — Inactivity Security Utility (Phase 2)
 *
 * Rules:
 * 1. Exactly 7 consecutive days of inactivity threshold (604,800,000 ms).
 * 2. Uses strictly server-side timestamps. Never trusts client timestamps.
 * 3. Differentiates qualifying meaningful user activities from passive background polling.
 */

import { Request } from 'express';

export const INACTIVITY_LIMIT_DAYS = 7;
export const INACTIVITY_LIMIT_MS = INACTIVITY_LIMIT_DAYS * 24 * 60 * 60 * 1000; // 604,800,000 ms

export interface InactivityCheckResult {
  expired: boolean;
  inactiveMs: number;
  lastActivityAt?: Date;
  limitMs: number;
}

/**
 * Evaluates whether the given lastActivityAt timestamp exceeds the 7-day inactivity threshold.
 *
 * Boundary condition:
 * - Exactly 7 days (inactiveMs <= INACTIVITY_LIMIT_MS) is valid.
 * - Beyond 7 days (inactiveMs > INACTIVITY_LIMIT_MS) is expired.
 */
export function evaluateInactivity(
  lastActivityAt?: Date | string | number | null,
  nowMs: number = Date.now()
): InactivityCheckResult {
  if (!lastActivityAt) {
    return {
      expired: false,
      inactiveMs: 0,
      limitMs: INACTIVITY_LIMIT_MS,
    };
  }

  const activityTime = new Date(lastActivityAt).getTime();
  if (isNaN(activityTime)) {
    return {
      expired: false,
      inactiveMs: 0,
      limitMs: INACTIVITY_LIMIT_MS,
    };
  }

  const inactiveMs = Math.max(0, nowMs - activityTime);
  const expired = inactiveMs > INACTIVITY_LIMIT_MS;

  return {
    expired,
    inactiveMs,
    lastActivityAt: new Date(activityTime),
    limitMs: INACTIVITY_LIMIT_MS,
  };
}

/**
 * Verifies whether a session token represents a genuine fresh re-authentication
 * capable of unlocking an account that is currently expired due to inactivity.
 *
 * Requirements for genuine re-authentication:
 * 1. Supabase Auth must provide a valid lastSignInAt timestamp.
 * 2. lastSignInAt must have occurred within a fresh window (e.g., past 15 minutes).
 * 3. lastSignInAt must be strictly newer than the stored dormant lastActivityAt.
 */
export function isGenuineReauth(
  lastActivityAt?: Date | string | null,
  lastSignInAt?: Date | string | null,
  nowMs: number = Date.now()
): boolean {
  if (!lastSignInAt) {
    return false;
  }

  const signInTime = new Date(lastSignInAt).getTime();
  if (isNaN(signInTime)) {
    return false;
  }

  // Freshness check: sign in must have occurred recently (within 15 minutes)
  const MAX_REAUTH_WINDOW_MS = 15 * 60 * 1000;
  if (nowMs - signInTime > MAX_REAUTH_WINDOW_MS) {
    return false;
  }

  // Sequence check: sign-in must have occurred AFTER the last recorded activity
  if (lastActivityAt) {
    const activityTime = new Date(lastActivityAt).getTime();
    if (!isNaN(activityTime) && signInTime <= activityTime) {
      return false;
    }
  }

  return true;
}

/**
 * Determines whether an incoming HTTP request constitutes qualifying meaningful activity.
 *
 * Qualifying Activities:
 * - Mutations: POST, PUT, PATCH, DELETE on vault entities (documents, members, workers, share packs).
 * - Explicit user reads: Document downloads (/download) and single document views (/:id).
 * - Explicit sign-in / profile sync (/api/auth/sync-profile).
 * - Vault document listing (/api/documents).
 *
 * Excluded Non-qualifying / Passive Activities:
 * - /api/health (system health check probe)
 * - /api/auth/me (passive verification/session polling on tab focus or mount)
 * - Automated scheduler or cron worker queries
 */
export function isQualifyingActivity(req: Request): boolean {
  const path = req.path || req.originalUrl || '';
  const method = (req.method || 'GET').toUpperCase();

  // Exclude health check
  if (path.includes('/api/health')) {
    return false;
  }

  // Exclude passive session / profile validation
  if (path === '/api/auth/me') {
    return false;
  }

  // Re-authentication and profile sync counts as meaningful
  if (path === '/api/auth/sync-profile') {
    return true;
  }

  // All state-modifying requests on vault APIs are qualifying
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }

  // Explicit document download or detail view
  if (path.includes('/download') || path.match(/\/api\/documents\/[0-9a-fA-F]{24}/)) {
    return true;
  }

  // Explicit document listing by active user
  if (path === '/api/documents' && method === 'GET') {
    return true;
  }

  return false;
}
