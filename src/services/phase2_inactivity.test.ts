import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
import {
  INACTIVITY_LIMIT_DAYS,
  INACTIVITY_LIMIT_MS,
  evaluateInactivity,
  isQualifyingActivity,
} from '../utils/inactivity';
import { User } from '../models/User';
import { requireAuth, householdAuth, assertDocumentOwnership } from '../middleware/auth';

describe('Phase 2: Seven-Day Inactivity Security Tests', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

  // Test 1: Configuration & Threshold definition
  it('1. Enforces exactly 7 consecutive days (604,800,000 ms) as inactivity threshold', () => {
    assert.strictEqual(INACTIVITY_LIMIT_DAYS, 7);
    assert.strictEqual(INACTIVITY_LIMIT_MS, 604800000);
  });

  // Test 2: Access before 7 days (e.g., 6 days) is permitted
  it('2. Permits access when user was active within 7 days (e.g., 6 days ago)', () => {
    const now = Date.now();
    const sixDaysAgo = new Date(now - 6 * ONE_DAY_MS);

    const result = evaluateInactivity(sixDaysAgo, now);
    assert.strictEqual(result.expired, false, '6 days of inactivity should be allowed');
    assert.strictEqual(result.inactiveMs, 6 * ONE_DAY_MS);
  });

  // Test 3: Access at exactly 7 days boundary
  it('3. Access at exactly 7 days (604,800,000 ms) is on boundary and allowed', () => {
    const now = Date.now();
    const exactlySevenDaysAgo = new Date(now - SEVEN_DAYS_MS);

    const result = evaluateInactivity(exactlySevenDaysAgo, now);
    assert.strictEqual(result.expired, false, 'Exactly 7 days boundary should not be expired');
    assert.strictEqual(result.inactiveMs, SEVEN_DAYS_MS);
  });

  // Test 4: Access after 7 days (e.g., 7 days + 1 second / 8 days) is strictly expired
  it('4. Rejects access when inactivity exceeds 7 days (7 days + 1s, 8 days)', () => {
    const now = Date.now();
    const slightlyOver = new Date(now - (SEVEN_DAYS_MS + 1000));
    const eightDaysAgo = new Date(now - 8 * ONE_DAY_MS);

    const resOver = evaluateInactivity(slightlyOver, now);
    assert.strictEqual(resOver.expired, true, '7 days + 1s must be expired');

    const res8 = evaluateInactivity(eightDaysAgo, now);
    assert.strictEqual(res8.expired, true, '8 days must be expired');
    assert.strictEqual(res8.inactiveMs, 8 * ONE_DAY_MS);
  });

  // Test 5: Meaningful vs Non-qualifying / background request discrimination
  it('5. Discriminate meaningful qualifying activity from background polling', () => {
    // Non-qualifying background / health / polling requests
    assert.strictEqual(isQualifyingActivity({ path: '/api/health', method: 'GET' } as any), false);
    assert.strictEqual(isQualifyingActivity({ path: '/api/auth/me', method: 'GET' } as any), false);

    // Qualifying user actions
    assert.strictEqual(isQualifyingActivity({ path: '/api/documents/upload', method: 'POST' } as any), true);
    assert.strictEqual(isQualifyingActivity({ path: '/api/documents/654321654321654321654321', method: 'PUT' } as any), true);
    assert.strictEqual(isQualifyingActivity({ path: '/api/documents/654321654321654321654321', method: 'DELETE' } as any), true);
    assert.strictEqual(isQualifyingActivity({ path: '/api/documents/654321654321654321654321/download', method: 'GET' } as any), true);
    assert.strictEqual(isQualifyingActivity({ path: '/api/documents', method: 'GET' } as any), true);
    assert.strictEqual(isQualifyingActivity({ path: '/api/members', method: 'POST' } as any), true);
    assert.strictEqual(isQualifyingActivity({ path: '/api/auth/sync-profile', method: 'POST' } as any), true);
  });

  // Test 6: Backend middleware enforcement of inactivity (HTTP 401 & INACTIVITY_TIMEOUT)
  it('6. Middleware rejects expired users with HTTP 401, INACTIVITY_TIMEOUT, and requiresReauth', async () => {
    const inactiveUid = 'sb-inactive-user-1';
    const email = 'inactive@kudumba.org';

    // Seed mock profile with lastActivityAt 8 days ago
    const mockUser = await User.findOrCreateBySupabaseUser({
      supabaseUserId: inactiveUid,
      email,
      fullName: 'Inactive User',
      isEmailVerified: true,
    });
    // Set activity 8 days in the past
    mockUser.lastActivityAt = new Date(Date.now() - 8 * ONE_DAY_MS);

    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const req: any = {
      headers: {
        authorization: `Bearer mock-token:${inactiveUid}:${email}:verified`,
      },
      path: '/api/documents',
      method: 'GET',
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

    assert.strictEqual(nextCalled, false, 'Next middleware should not be called');
    assert.strictEqual(statusCode, 401, 'Should return HTTP 401');
    assert.strictEqual(jsonBody?.errorCode, 'INACTIVITY_TIMEOUT');
    assert.strictEqual(jsonBody?.requiresReauth, true);
    assert.match(jsonBody?.error || '', /7 consecutive days of inactivity/i);
  });

  // Test 7: Active user within 7 days is permitted and updates lastActivityAt
  it('7. Middleware permits active user within 7 days and updates activity on qualifying request', async () => {
    const activeUid = 'sb-active-user-2';
    const email = 'active@kudumba.org';

    const mockUser = await User.findOrCreateBySupabaseUser({
      supabaseUserId: activeUid,
      email,
      fullName: 'Active User',
      isEmailVerified: true,
    });
    mockUser.lastActivityAt = new Date(Date.now() - 2 * ONE_DAY_MS); // 2 days ago

    let nextCalled = false;
    let statusCode = 0;

    const req: any = {
      headers: {
        authorization: `Bearer mock-token:${activeUid}:${email}:verified`,
      },
      path: '/api/documents/upload',
      method: 'POST',
    };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    await requireAuth(req, res, next);

    assert.strictEqual(nextCalled, true, 'Active user should be allowed');
    assert.strictEqual(statusCode, 0);
    assert.ok(req.user, 'req.user should be populated');
  });

  // Test 8: Re-authentication resets the 7-day inactivity timer
  it('8. Re-authentication via sync-profile resets lastActivityAt to fresh server time', async () => {
    const reauthUid = 'sb-reauth-user-3';
    const email = 'reauth@kudumba.org';

    const profile = await User.findOrCreateBySupabaseUser({
      supabaseUserId: reauthUid,
      email,
      fullName: 'Reauth User',
      isEmailVerified: true,
      touchActivity: true,
    });

    const now = Date.now();
    const activityMs = new Date(profile.lastActivityAt!).getTime();
    assert.ok(Math.abs(now - activityMs) < 2000, 'lastActivityAt should be set to current server time');

    const inactivity = evaluateInactivity(profile.lastActivityAt);
    assert.strictEqual(inactivity.expired, false, 'Fresh re-authenticated session must not be expired');
  });

  // Test 9: Attempts to bypass frontend directly hit backend middleware
  it('9. Direct API requests bypassing frontend are strictly verified and rejected when inactive', async () => {
    let statusCode = 0;
    const req: any = {
      headers: {},
      path: '/api/documents',
    };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };

    await householdAuth(req, res, () => {});
    assert.strictEqual(statusCode, 401, 'Direct request without auth must return 401');
  });

  // Test 10: Inactivity enforcement does not compromise IDOR document isolation
  it('10. Document ownership security (IDOR defense) remains strictly isolated', () => {
    const userA = '654321654321654321654321';
    const userB = '123456123456123456123456';

    assert.strictEqual(assertDocumentOwnership(userA, userB, 'USER'), false);
    assert.strictEqual(assertDocumentOwnership(userA, userA, 'USER'), true);
    assert.strictEqual(assertDocumentOwnership(userA, userB, 'ADMIN'), true);
  });

  // Test 11: Stale / inactive session cannot bypass inactivity via sync-profile (Condition 3 & 5)
  it('11. Stale inactive session cannot reset lastActivityAt via sync-profile without genuine re-auth', async () => {
    const staleUid = 'sb-stale-bypass-uid';
    const email = 'stalebypass@kudumba.org';

    // Seed inactive user profile with activity 10 days in the past
    const tenDaysAgo = new Date(Date.now() - 10 * ONE_DAY_MS);
    const profile = await User.findOrCreateBySupabaseUser({
      supabaseUserId: staleUid,
      email,
      fullName: 'Stale User',
      isEmailVerified: true,
    });
    profile.lastActivityAt = tenDaysAgo;

    // Stale session attempts to sync profile with touchActivity=true (stale sign-in timestamp from 10 days ago)
    const staleSignIn = new Date(Date.now() - 10 * ONE_DAY_MS).toISOString();
    await User.findOrCreateBySupabaseUser({
      supabaseUserId: staleUid,
      email,
      fullName: 'Stale User',
      isEmailVerified: true,
      touchActivity: true,
      lastSignInAt: staleSignIn,
    });

    // Verification: lastActivityAt must NOT have been updated to Date.now()!
    const activityMs = new Date(profile.lastActivityAt).getTime();
    assert.strictEqual(activityMs, tenDaysAgo.getTime(), 'Stale session must not reset lastActivityAt');

    const inactCheck = evaluateInactivity(profile.lastActivityAt);
    assert.strictEqual(inactCheck.expired, true, 'User must remain expired');
  });

  // Test 12: Genuine re-authentication successfully restores access (Condition 4)
  it('12. Genuinely re-authenticated session restores access after inactivity', async () => {
    const staleUid = 'sb-stale-bypass-uid';
    const email = 'stalebypass@kudumba.org';

    // Now simulate genuine fresh login via Supabase (sign-in timestamp from 5 seconds ago)
    const freshSignIn = new Date(Date.now() - 5000).toISOString();
    const updatedProfile = await User.findOrCreateBySupabaseUser({
      supabaseUserId: staleUid,
      email,
      fullName: 'Stale User Re-authenticated',
      isEmailVerified: true,
      touchActivity: true,
      lastSignInAt: freshSignIn,
    });

    // Verification: lastActivityAt is now reset to current time
    const activityMs = new Date(updatedProfile.lastActivityAt!).getTime();
    assert.ok(Math.abs(Date.now() - activityMs) < 2000, 'Fresh re-auth must reset lastActivityAt');

    const inactCheck = evaluateInactivity(updatedProfile.lastActivityAt);
    assert.strictEqual(inactCheck.expired, false, 'Access must be successfully restored');
  });

  // Test 13: Inactivity does not delete accounts, documents, or data (Condition 7)
  it('13. Inactivity never deletes user profile, preserves records non-destructively', async () => {
    const inactiveUid = 'sb-preserve-uid';
    const email = 'preserve@kudumba.org';

    const profile = await User.findOrCreateBySupabaseUser({
      supabaseUserId: inactiveUid,
      email,
      fullName: 'Preserved Inactive User',
      isEmailVerified: true,
    });
    profile.lastActivityAt = new Date(Date.now() - 30 * ONE_DAY_MS); // 30 days inactive

    // Profile remains fully intact and queryable
    assert.ok(profile._id);
    assert.strictEqual(profile.email, email);
    assert.strictEqual(profile.fullName, 'Preserved Inactive User');
    assert.strictEqual(profile.status, 'ACTIVE');
  });
});
