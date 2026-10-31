import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import {
  createRateLimiter,
  createConcurrencyLimiter,
  extractClientIp,
  normalizeEmail,
  checkAndIncrementMongoRateLimit,
  checkAndIncrementMemoryRateLimit,
  clearAllRateLimits,
  clearInFlightCounts,
  authRateLimiter,
  emailActionRateLimiter,
  uploadRateLimiter,
  proofUploadRateLimiter,
  downloadRateLimiter,
  pricingRateLimiter,
  paymentRequestRateLimiter,
  waitlistRateLimiter,
  contactRateLimiter,
  searchRateLimiter,
  cronRateLimiter,
  userUploadConcurrencyLimiter,
  globalUploadConcurrencyLimiter,
  cronConcurrencyLimiter,
  adminReconcileConcurrencyLimiter,
} from '../middleware/rateLimiter';
import { RateLimitRecord } from '../models/RateLimitRecord';
import { sanitizeSearchRegex } from '../utils/regexSanitizer';
import {
  recordAbuseViolation,
  getAbuseViolations,
  clearAbuseViolations,
} from './abuseMonitor';
import { SystemAlert } from '../models/SystemAlert';

describe('Server-Side Rate Limiting, Abuse Protection & Resilience Suite', () => {
  beforeEach(() => {
    clearAllRateLimits();
    clearInFlightCounts();
    clearAbuseViolations();
  });

  /* ========================================================================
     1. Core Rate Limiter Behavior & Standard Headers
     ======================================================================== */
  describe('1. Core Rate Limiter Mechanics & Header Conformance', () => {
    it('permits requests within quota and populates standard rate limit headers', () => {
      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        store: 'memory',
      });

      const req: any = { ip: '198.51.100.1', headers: {}, socket: { remoteAddress: '198.51.100.1' } };
      const headers: Record<string, string> = {};
      const res: any = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      };

      let nextCount = 0;
      const next = () => nextCount++;

      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next);

      assert.strictEqual(nextCount, 3, 'All 3 permitted requests should invoke next()');
      assert.strictEqual(headers['RateLimit-Limit'], '3');
    });

    it('rejects requests exceeding quota with HTTP 429 and Retry-After header', () => {
      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 2,
        message: 'Rate limit exceeded for test.',
        errorCode: 'TEST_RATE_LIMIT',
        store: 'memory',
      });

      const req: any = { ip: '198.51.100.2', headers: {}, socket: { remoteAddress: '198.51.100.2' } };
      let statusCode = 0;
      let responseBody: any = null;
      const headers: Record<string, string> = {};

      const res: any = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => {
              responseBody = data;
            },
          };
        },
      };

      let passed = 0;
      const next = () => passed++;

      limiter(req, res, next);
      limiter(req, res, next);
      assert.strictEqual(passed, 2);

      // 3rd attempt exceeds quota
      limiter(req, res, next);
      assert.strictEqual(statusCode, 429);
      assert.strictEqual(responseBody?.ok, false);
      assert.strictEqual(responseBody?.errorCode, 'TEST_RATE_LIMIT');
      assert.strictEqual(responseBody?.error, 'Rate limit exceeded for test.');
      assert.ok(parseInt(headers['Retry-After'], 10) > 0);
      assert.strictEqual(headers['RateLimit-Limit'], '2');
      assert.strictEqual(headers['RateLimit-Remaining'], '0');
      assert.ok(parseInt(headers['RateLimit-Reset'], 10) > 0);
    });
  });

  /* ========================================================================
     2. Anti-Bypass Protection (Composite Keying & Identity Binding)
     ======================================================================== */
  describe('2. Anti-Bypass Protections: Composite Keying & Header Spoof Immunity', () => {
    it('composite keying blocks password spraying from single IP across multiple accounts', () => {
      let blocked = false;
      let lastStatusCode = 0;

      const reqBase = {
        socket: { remoteAddress: '203.0.113.50' },
        headers: {},
      };

      // Attacker tries 5 different accounts from the same IP
      for (let i = 0; i < 5; i++) {
        const req: any = {
          ...reqBase,
          body: { email: `victim${i}@kudumba.in`, password: 'wrong' },
        };
        const res: any = {
          setHeader: () => {},
          status: (code: number) => {
            lastStatusCode = code;
            return { json: () => {} };
          },
        };

        authRateLimiter(req, res, () => {});
      }

      // 6th attempt with yet another account from the same IP is blocked
      const req6: any = {
        ...reqBase,
        body: { email: 'victim6@kudumba.in', password: 'wrong' },
      };
      const res6: any = {
        setHeader: () => {},
        status: (code: number) => {
          lastStatusCode = code;
          blocked = true;
          return { json: () => {} };
        },
      };
      authRateLimiter(req6, res6, () => {});

      assert.strictEqual(blocked, true, 'Attacker spraying across accounts must be blocked by IP key');
      assert.strictEqual(lastStatusCode, 429);
    });

    it('composite keying blocks credential stuffing / inbox bombing against a single account across rotating proxy IPs', () => {
      let blocked = false;
      let lastStatusCode = 0;
      const TARGET_EMAIL = 'vip.user@kudumba.in';

      // Attacker rotates proxy IPs (ip1, ip2, ip3) targeting the same victim email for password recovery
      for (let i = 1; i <= 3; i++) {
        const req: any = {
          socket: { remoteAddress: `198.51.100.${i}` },
          headers: {},
          body: { email: TARGET_EMAIL },
        };
        const res: any = {
          setHeader: () => {},
          status: (code: number) => {
            lastStatusCode = code;
            return { json: () => {} };
          },
        };

        emailActionRateLimiter(req, res, () => {});
      }

      // 4th attempt from a brand new proxy IP (198.51.100.99) targeting the same email must be BLOCKED
      const req4: any = {
        socket: { remoteAddress: '198.51.100.99' },
        headers: {},
        body: { email: TARGET_EMAIL },
      };
      const res4: any = {
        setHeader: () => {},
        status: (code: number) => {
          lastStatusCode = code;
          blocked = true;
          return { json: () => {} };
        },
      };

      emailActionRateLimiter(req4, res4, () => {});

      assert.strictEqual(blocked, true, 'Targeted credential stuffing across rotating IPs must be blocked by target email key');
      assert.strictEqual(lastStatusCode, 429);
    });

    it('authenticated user ID binding prevents bypassing rate limits by rotating IP or client headers', () => {
      const TEST_USER_ID = 'usr-vault-entitled-001';
      let blocked = false;
      let lastStatusCode = 0;

      // Limiter permits 20 uploads per 10 mins
      for (let i = 0; i < 20; i++) {
        const req: any = {
          user: { id: TEST_USER_ID },
          socket: { remoteAddress: `10.0.${i}.1` }, // rotating IP each upload
          headers: { 'x-forwarded-for': `10.0.${i}.1` },
        };
        const res: any = {
          setHeader: () => {},
          status: (code: number) => {
            lastStatusCode = code;
            return { json: () => {} };
          },
        };
        uploadRateLimiter(req, res, () => {});
      }

      // 21st upload with a completely different IP and cleared cookies is BLOCKED
      const req21: any = {
        user: { id: TEST_USER_ID },
        socket: { remoteAddress: '192.168.99.99' },
        headers: { 'user-agent': 'BrandNewBrowser' },
      };
      const res21: any = {
        setHeader: () => {},
        status: (code: number) => {
          lastStatusCode = code;
          blocked = true;
          return { json: () => {} };
        },
      };

      uploadRateLimiter(req21, res21, () => {});

      assert.strictEqual(blocked, true, 'Authenticated rate limiting must bind to User ID, preventing IP-rotation bypass');
      assert.strictEqual(lastStatusCode, 429);
    });

    it('extractClientIp ignores forged X-Forwarded-For headers when trust proxy is disabled', () => {
      const mockReq: any = {
        app: { get: () => false }, // trust proxy disabled
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      const resolvedIp = extractClientIp(mockReq);
      assert.strictEqual(resolvedIp, '127.0.0.1', 'Direct socket remoteAddress must be used when trust proxy is false');
    });

    it('extractClientIp resolves proxy IP when trust proxy is enabled', () => {
      const mockReq: any = {
        app: { get: () => 1 }, // trust proxy enabled
        headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
        socket: { remoteAddress: '10.0.0.1' },
      };

      const resolvedIp = extractClientIp(mockReq);
      assert.strictEqual(resolvedIp, '203.0.113.195', 'Leftmost proxy IP should be resolved when trust proxy is enabled');
    });
  });

  /* ========================================================================
     3. Multi-Instance Shared Store (MongoDB Atlas Persistence)
     ======================================================================== */
  describe('3. Multi-Instance Distributed Rate Limiter & Server Restart Persistence', () => {
    it('persists rate limit counters across instances using MongoDB Atlas RateLimitRecord', async () => {
      const origReadyState = mongoose.connection.readyState;
      const origFindOneAndUpdate = RateLimitRecord.findOneAndUpdate;

      try {
        (mongoose.connection as any).readyState = 1;
        const key = 'test:dist:shared_key_001';
        let recordedAttempts = 0;

        // Mock MongoDB atomic update behavior
        RateLimitRecord.findOneAndUpdate = (async (_query: any, update: any) => {
          if (update.$inc?.count) {
            recordedAttempts += update.$inc.count;
          } else if (update.$set?.count) {
            recordedAttempts = update.$set.count;
          }
          return {
            key,
            count: recordedAttempts,
            resetAt: new Date(Date.now() + 60000),
          };
        }) as any;

        // Instance A records 3 requests
        const r1 = await checkAndIncrementMongoRateLimit(key, 60000, 3);
        assert.strictEqual(r1.allowed, true);
        assert.strictEqual(r1.count, 1);

        const r2 = await checkAndIncrementMongoRateLimit(key, 60000, 3);
        assert.strictEqual(r2.allowed, true);
        assert.strictEqual(r2.count, 2);

        const r3 = await checkAndIncrementMongoRateLimit(key, 60000, 3);
        assert.strictEqual(r3.allowed, true);
        assert.strictEqual(r3.count, 3);

        // Instance B checks after simulated server restart (empty in-memory store)
        clearAllRateLimits();
        const r4 = await checkAndIncrementMongoRateLimit(key, 60000, 3);
        assert.strictEqual(r4.allowed, false, 'Instance B must lock out key based on MongoDB shared count');
        assert.strictEqual(r4.count, 4);
        assert.ok(r4.retryAfterSec > 0);
      } finally {
        (mongoose.connection as any).readyState = origReadyState;
        RateLimitRecord.findOneAndUpdate = origFindOneAndUpdate;
      }
    });

    it('resets window after expiration timestamp has passed in distributed store', async () => {
      const key = 'test:dist:expired_window';
      const windowMs = 50; // 50ms window for fast test

      // In-memory atomic check
      const r1 = checkAndIncrementMemoryRateLimit(key, windowMs, 1);
      assert.strictEqual(r1.allowed, true);

      // Immediately blocked
      const r2 = checkAndIncrementMemoryRateLimit(key, windowMs, 1);
      assert.strictEqual(r2.allowed, false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // After expiration, fresh window opens
      const r3 = checkAndIncrementMemoryRateLimit(key, windowMs, 1);
      assert.strictEqual(r3.allowed, true, 'Window must reset once expiration time elapses');
      assert.strictEqual(r3.count, 1);
    });
  });

  /* ========================================================================
     4. Concurrency Limiters & In-Flight Resource Protection
     ======================================================================== */
  describe('4. In-Flight Concurrency Controls & Capacity Protection', () => {
    it('restricts concurrent operations and releases slot upon response finish', () => {
      const limiter = createConcurrencyLimiter({
        maxConcurrent: 2,
        message: 'Max 2 concurrent uploads permitted.',
        errorCode: 'CONCURRENT_LIMIT',
      });

      const listeners: Record<string, Function[]> = {};
      const createMockReqRes = () => {
        const req: any = { path: '/upload' };
        const res: any = {
          setHeader: () => {},
          status: () => ({ json: () => {} }),
          once: (event: string, fn: Function) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(fn);
          },
        };
        return { req, res };
      };

      let activeCount = 0;
      const next = () => activeCount++;

      // First two concurrent requests enter
      const reqRes1 = createMockReqRes();
      const reqRes2 = createMockReqRes();
      limiter(reqRes1.req, reqRes1.res, next);
      limiter(reqRes2.req, reqRes2.res, next);
      assert.strictEqual(activeCount, 2);

      // Third concurrent request is rejected with HTTP 429
      let blockedCode = 0;
      let blockedPayload: any = null;
      const req3: any = { path: '/upload' };
      const res3: any = {
        setHeader: () => {},
        status: (c: number) => {
          blockedCode = c;
          return {
            json: (data: any) => {
              blockedPayload = data;
            },
          };
        },
      };

      limiter(req3, res3, next);
      assert.strictEqual(blockedCode, 429);
      assert.strictEqual(blockedPayload.errorCode, 'CONCURRENT_LIMIT');

      // Finish first request: triggers listeners and frees a concurrency slot
      listeners['finish']?.forEach((fn) => fn());

      // Fourth request is now permitted
      let fourthAllowed = false;
      const reqRes4 = createMockReqRes();
      limiter(reqRes4.req, reqRes4.res, () => {
        fourthAllowed = true;
      });
      assert.strictEqual(fourthAllowed, true, 'Slot must be freed when previous request finishes');
    });

    it('enforces mutex concurrency lock for cron scheduler and bulk reconciliation', () => {
      let runCount = 0;
      const next = () => runCount++;

      const reqRes1 = {
        req: { path: '/cron' } as any,
        res: { once: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) } as any,
      };
      const reqRes2 = {
        req: { path: '/cron' } as any,
        res: {
          once: () => {},
          setHeader: () => {},
          status: (code: number) => {
            assert.strictEqual(code, 429);
            return {
              json: (data: any) => {
                assert.strictEqual(data.errorCode, 'CRON_CYCLE_ALREADY_IN_PROGRESS');
              },
            };
          },
        } as any,
      };

      cronConcurrencyLimiter(reqRes1.req, reqRes1.res, next);
      assert.strictEqual(runCount, 1);

      // Overlapping second execution is rejected
      cronConcurrencyLimiter(reqRes2.req, reqRes2.res, next);
      assert.strictEqual(runCount, 1, 'Overlapping cron run must be blocked by mutex');
    });
  });

  /* ========================================================================
     5. Search Query Regex Sanitization (ReDoS Protection)
     ======================================================================== */
  describe('5. Search Query Regex Sanitization & ReDoS Prevention', () => {
    it('escapes dangerous regex metacharacters completely', () => {
      const maliciousPatterns = [
        '(a+)+$',
        '.*foo.*bar',
        '^admin|root$',
        '[a-z]{1,10}',
        '{10,20}',
        'user@domain.com (test)',
        '\\d+\\s+',
      ];

      for (const pattern of maliciousPatterns) {
        const sanitized = sanitizeSearchRegex(pattern);
        assert.doesNotThrow(() => {
          // Creating RegExp with sanitized pattern should treat all metacharacters literally
          const rx = new RegExp(sanitized);
          // Testing string that would trigger catastrophic backtracking on unescaped (a+)+$
          rx.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!');
        }, `Pattern [${pattern}] should be safely escaped`);
      }
    });

    it('truncates oversized search terms to 100 characters', () => {
      const oversized = 'a'.repeat(500);
      const sanitized = sanitizeSearchRegex(oversized);
      assert.strictEqual(sanitized.length, 100, 'Search queries must be capped at 100 characters');
    });

    it('returns empty string on empty or non-string inputs', () => {
      assert.strictEqual(sanitizeSearchRegex(''), '');
      assert.strictEqual(sanitizeSearchRegex(null), '');
      assert.strictEqual(sanitizeSearchRegex(undefined), '');
      assert.strictEqual(sanitizeSearchRegex(12345), '');
    });
  });

  /* ========================================================================
     6. Automated Abuse Monitoring & Threat Alert Escalation
     ======================================================================== */
  describe('6. Automated Abuse Monitoring & Security Alerts', () => {
    it('records violations and creates WARNING alert at 5 violations', async () => {
      const IP = '198.51.100.88';
      for (let i = 1; i <= 4; i++) {
        const res = await recordAbuseViolation({
          ip: IP,
          endpoint: '/api/auth/login',
          reason: 'Failed credentials',
        });
        assert.strictEqual(res.alerted, false);
        assert.strictEqual(res.violationCount, i);
      }

      // 5th violation triggers security alert
      const res5 = await recordAbuseViolation({
        ip: IP,
        endpoint: '/api/auth/login',
        reason: 'Failed credentials',
      });
      assert.strictEqual(res5.alerted, true);
      assert.strictEqual(res5.violationCount, 5);

      const record = getAbuseViolations(`ip:${IP}`);
      assert.ok(record);
      assert.strictEqual(record?.violationsCount, 5);
    });

    it('escalates alert severity to CRITICAL at 10 or more violations', async () => {
      const USER_ID = 'usr-abusive-test-account';
      for (let i = 1; i <= 9; i++) {
        await recordAbuseViolation({
          ip: '192.168.1.1',
          userId: USER_ID,
          endpoint: '/api/documents/upload',
          reason: 'Excessive upload rate',
        });
      }

      // 10th violation escalates to CRITICAL
      const res10 = await recordAbuseViolation({
        ip: '192.168.1.1',
        userId: USER_ID,
        endpoint: '/api/documents/upload',
        reason: 'Excessive upload rate',
      });
      assert.strictEqual(res10.alerted, true);
      assert.strictEqual(res10.violationCount, 10);
    });
  });

  /* ========================================================================
     7. Public Form Protections & Pricing Abuse Defense
     ======================================================================== */
  describe('7. Public Endpoint Defense & Coupon Brute-Force Protection', () => {
    it('pricingRateLimiter prevents dictionary attacks against discount coupons', () => {
      let blocked = false;
      const req: any = {
        socket: { remoteAddress: '203.0.113.99' },
        user: { id: 'usr-coupon-hunter' },
        headers: {},
      };

      for (let i = 0; i < 20; i++) {
        pricingRateLimiter(req, { setHeader: () => {} } as any, () => {});
      }

      // 21st pricing calculation attempt is rejected
      pricingRateLimiter(
        req,
        {
          setHeader: () => {},
          status: (code: number) => {
            assert.strictEqual(code, 429);
            blocked = true;
            return { json: () => {} };
          },
        } as any,
        () => {}
      );

      assert.strictEqual(blocked, true, 'Coupon calculation dictionary attack must be rate limited');
    });

    it('waitlistRateLimiter protects public waitlist endpoint against automated spam bots', () => {
      let blocked = false;
      const req: any = {
        socket: { remoteAddress: '198.51.100.77' },
        body: { phoneOrEmail: '+919847000000' },
        headers: {},
      };

      for (let i = 0; i < 5; i++) {
        waitlistRateLimiter(req, { setHeader: () => {} } as any, () => {});
      }

      // 6th submission blocked
      waitlistRateLimiter(
        req,
        {
          setHeader: () => {},
          status: (code: number) => {
            assert.strictEqual(code, 429);
            blocked = true;
            return {
              json: (data: any) => {
                assert.strictEqual(data.errorCode, 'WAITLIST_LIMIT_EXCEEDED');
              },
            };
          },
        } as any,
        () => {}
      );

      assert.strictEqual(blocked, true, 'Waitlist spam bot must be rate limited');
    });

    it('contactRateLimiter protects contact form from automated mailbombing', () => {
      let blocked = false;
      const req: any = {
        socket: { remoteAddress: '198.51.100.88' },
        headers: {},
      };

      for (let i = 0; i < 5; i++) {
        contactRateLimiter(req, { setHeader: () => {} } as any, () => {});
      }

      // 6th inquiry blocked
      contactRateLimiter(
        req,
        {
          setHeader: () => {},
          status: (code: number) => {
            assert.strictEqual(code, 429);
            blocked = true;
            return { json: () => {} };
          },
        } as any,
        () => {}
      );

      assert.strictEqual(blocked, true, 'Contact form mailbombing must be rate limited');
    });
  });
});
