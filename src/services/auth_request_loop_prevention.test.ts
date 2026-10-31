process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiGetMe,
  apiGetSubscriptionStatus,
  setApiAccessToken,
  apiLogout,
  apiSimulateSubscriptionDev,
  getApiDiagnostics,
  clearApiDiagnostics,
} from './apiClient';

describe('Auth Request Loop Prevention & Deduplication Suite', () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCounts: Record<string, number> = {};

  beforeEach(() => {
    clearApiDiagnostics();
    fetchCallCounts = {};
    setApiAccessToken('mock-test-access-token-123');

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      fetchCallCounts[urlStr] = (fetchCallCounts[urlStr] || 0) + 1;

      if (urlStr.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: 'test-user-id-123',
              name: 'Athil',
              fullName: 'Athil Chalil',
              email: 'athil@kudumba.test',
              role: 'USER',
              status: 'ACTIVE',
              preferredLang: 'en',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/api/subscription/status')) {
        return new Response(
          JSON.stringify({
            ok: true,
            entitlement: {
              status: 'trialing',
              planId: 'kudumbam_founding',
              canUpload: true,
              canDownloadOrView: true,
              storageQuotaBytes: 3221225472,
              usedBytes: 1048576,
              availableBytes: 3220176896,
              maxFileSizeBytes: 26214400,
              isSimulatedDev: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/api/auth/logout')) {
        return new Response(JSON.stringify({ ok: true, message: 'Logged out' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/api/subscription/simulate')) {
        return new Response(
          JSON.stringify({
            ok: true,
            entitlement: {
              status: 'active',
              planId: 'kudumbam_annual',
              planName: 'Kudumbam Annual',
              canUpload: true,
              canDownloadOrView: true,
              storageQuotaBytes: 10737418240, // 10 GiB
              usedBytes: 1048576,
              availableBytes: 10736369664,
              maxFileSizeBytes: 52428800, // 50 MiB
              isSimulatedDev: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setApiAccessToken(null);
  });

  test('1. Concurrent parallel calls to apiGetMe() are deduplicated into a single network request', async () => {
    const [user1, user2, user3] = await Promise.all([
      apiGetMe({ trigger: 'call_1' }),
      apiGetMe({ trigger: 'call_2' }),
      apiGetMe({ trigger: 'call_3' }),
    ]);

    assert.ok(user1);
    assert.strictEqual(user1?.email, 'athil@kudumba.test');
    assert.strictEqual(user2?.email, 'athil@kudumba.test');
    assert.strictEqual(user3?.email, 'athil@kudumba.test');

    // Exactly 1 network fetch should have been made to /api/auth/me
    const meRequests = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'));
    assert.ok(meRequests);
    assert.strictEqual(meRequests[1], 1, 'Concurrent calls to apiGetMe must be deduplicated into 1 request');
  });

  test('2. Rapid sequential calls to apiGetMe() within TTL reuse cached profile without network requests', async () => {
    const first = await apiGetMe();
    assert.ok(first);

    const second = await apiGetMe();
    assert.ok(second);

    const third = await apiGetMe();
    assert.ok(third);

    const meRequests = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'));
    assert.strictEqual(meRequests?.[1], 1, 'Sequential calls within cache window must not fire duplicate requests');
  });

  test('3. Concurrent parallel calls to apiGetSubscriptionStatus() are deduplicated into a single request', async () => {
    const [status1, status2, status3] = await Promise.all([
      apiGetSubscriptionStatus({ trigger: 'comp_1' }),
      apiGetSubscriptionStatus({ trigger: 'comp_2' }),
      apiGetSubscriptionStatus({ trigger: 'comp_3' }),
    ]);

    assert.ok(status1);
    assert.strictEqual(status1.status, 'trialing');
    assert.strictEqual(status2.status, 'trialing');
    assert.strictEqual(status3.status, 'trialing');

    const statusRequests = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/subscription/status'));
    assert.ok(statusRequests);
    assert.strictEqual(statusRequests[1], 1, 'Concurrent calls to apiGetSubscriptionStatus must be deduplicated');
  });

  test('4. Logged out state immediately stops protected queries without network calls', async () => {
    setApiAccessToken(null);

    const user = await apiGetMe();
    assert.strictEqual(user, null);

    const meRequests = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'));
    assert.strictEqual(meRequests, undefined, 'No requests to /api/auth/me should be made when token is null');
  });

  test('5. 401 response activates cooldown backoff and prevents continuous loop polling', async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // First call encounters 401
    const firstAttempt = await apiGetMe({ force: true });
    assert.strictEqual(firstAttempt, null);

    // Immediate second call is suppressed by cooldown without network call
    let secondFetchFired = false;
    globalThis.fetch = async () => {
      secondFetchFired = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const secondAttempt = await apiGetMe();
    assert.strictEqual(secondAttempt, null);
    assert.strictEqual(secondFetchFired, false, 'Cooldown must suppress immediate loop retries on 401');
  });

  test('6. Sanitized diagnostics log tracks endpoint requests without leaking secrets', async () => {
    await apiGetMe({ trigger: 'diagnostic_test' });

    const diagnostics = getApiDiagnostics();
    assert.ok(diagnostics.length > 0);

    const lastEntry = diagnostics[diagnostics.length - 1];
    assert.strictEqual(lastEntry.url, '/api/auth/me');
    assert.strictEqual(lastEntry.status, 200);
    assert.strictEqual(lastEntry.trigger, 'diagnostic_test');
    assert.strictEqual(lastEntry.hasToken, true);

    // Verify no secrets exist in the diagnostic entry
    const entryJson = JSON.stringify(lastEntry);
    assert.strictEqual(entryJson.includes('mock-test-access-token-123'), false, 'Diagnostic log must never expose tokens');
  });

  test('7. Account switching isolates and invalidates caches across different tokens', async () => {
    // Initial fetch under User 1
    const user1 = await apiGetMe();
    assert.ok(user1);
    assert.strictEqual(user1?.email, 'athil@kudumba.test');

    const meCountBefore = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'))?.[1] || 0;
    assert.strictEqual(meCountBefore, 1);

    // Switch account to new token
    setApiAccessToken('mock-switched-user-token-789');

    // Fetch again under User 2 - cache must be invalidated and fire a new network request
    const user2 = await apiGetMe();
    assert.ok(user2);

    const meCountAfter = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'))?.[1] || 0;
    assert.strictEqual(meCountAfter, 2, 'Account switch must invalidate cached profile and fetch fresh user');
  });

  test('8. apiLogout() purges caches and halts protected queries', async () => {
    await apiGetMe();
    await apiGetSubscriptionStatus();

    // Perform logout
    const logoutRes = await apiLogout();
    assert.strictEqual(logoutRes.ok, true);

    const meCountBefore = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'))?.[1] || 0;

    // Any subsequent calls while logged out should immediately return null/throw without network calls
    const userAfterLogout = await apiGetMe();
    assert.strictEqual(userAfterLogout, null);

    const meCountAfter = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/auth/me'))?.[1] || 0;
    assert.strictEqual(meCountAfter, meCountBefore, 'No network requests after logout');
  });

  test('9. apiSimulateSubscriptionDev() immediately updates subscription cache with active entitlement', async () => {
    // 1. Initial status is trialing
    const initialStatus = await apiGetSubscriptionStatus();
    assert.strictEqual(initialStatus.status, 'trialing');
    assert.strictEqual(initialStatus.planId, 'kudumbam_founding');

    // 2. Perform simulated upgrade
    const simRes = await apiSimulateSubscriptionDev('SIMULATE_UPGRADE');
    assert.strictEqual(simRes.status, 'active');

    // 3. Immediately read entitlement status - should reflect active plan from cache without additional network calls
    const statusCallsBefore = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/subscription/status'))?.[1] || 0;
    const freshStatus = await apiGetSubscriptionStatus();

    assert.strictEqual(freshStatus.status, 'active');
    assert.strictEqual(freshStatus.planId, 'kudumbam_annual');

    const statusCallsAfter = Object.entries(fetchCallCounts).find(([url]) => url.includes('/api/subscription/status'))?.[1] || 0;
    assert.strictEqual(statusCallsAfter, statusCallsBefore, 'Simulated upgrade must update cache immediately and eliminate extra fetch');
  });

  test('10. Diagnostics sanitize sensitive query parameters and never expose credentials or tokens', async () => {
    // Make call to endpoint with query parameters
    clearApiDiagnostics();
    await apiGetMe({ trigger: 'test_strip_query' });

    const entries = getApiDiagnostics();
    assert.ok(entries.length > 0);
    const meEntry = entries.find((e) => e.url.includes('/api/auth/me'));
    assert.ok(meEntry);
    assert.strictEqual(meEntry.url, '/api/auth/me', 'URL in diagnostics must be stripped of parameters');
    assert.strictEqual(typeof meEntry.hasToken, 'boolean');
  });
});
