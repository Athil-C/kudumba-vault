import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { DobLockout } from '../models/DobLockout';
import { RateLimitRecord } from '../models/RateLimitRecord';
import { isMockDbAllowed } from '../models/User';
import { recordAbuseViolation } from '../services/abuseMonitor';

export interface RateLimitRecordEntry {
  attempts: number;
  resetAt: number;
}

/**
 * Extracts client IP securely.
 * When 'trust proxy' is configured on the Express app, leverages Express's proxy-aware req.ip resolver.
 * When 'trust proxy' is disabled (the default), strictly uses the direct connection socket address,
 * ignoring any untrusted client-supplied X-Forwarded-For headers.
 */
export function extractClientIp(req: Request): string {
  const isTrustProxy = Boolean(req.app?.get?.('trust proxy'));
  if (isTrustProxy) {
    if (req.ip) return req.ip;
    const forwarded = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || req.ip || 'unknown-ip';
}

/**
 * Normalizes email address for consistent rate-limiting across case variations and whitespace.
 */
export function normalizeEmail(email?: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * In-memory fallback / test store.
 */
const globalMemoryStore = new Map<string, RateLimitRecordEntry>();

export function clearAllRateLimits(): void {
  globalMemoryStore.clear();
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  errorCode?: string;
  keyGenerator?: (req: Request) => string | string[];
  skip?: (req: Request) => boolean;
  store?: 'auto' | 'memory' | 'mongo';
  onLimitReached?: (req: Request, res: Response, key: string) => void | Promise<void>;
}

/**
 * Performs an atomic check & increment against the persistent MongoDB Atlas RateLimitRecord collection.
 */
export async function checkAndIncrementMongoRateLimit(
  key: string,
  windowMs: number,
  max: number
): Promise<{ allowed: boolean; count: number; resetAt: number; retryAfterSec: number }> {
  const now = new Date();
  const resetAt = new Date(Date.now() + windowMs);

  try {
    // 1. Try atomic increment on active, unexpired window
    let record = await RateLimitRecord.findOneAndUpdate(
      { key, resetAt: { $gt: now } },
      { $inc: { count: 1 }, $set: { updatedAt: now } },
      { new: true }
    );

    // 2. Window expired or non-existent: reset or upsert fresh window
    if (!record) {
      try {
        record = await RateLimitRecord.findOneAndUpdate(
          { key, $or: [{ resetAt: { $lte: now } }, { resetAt: { $exists: false } }] },
          { $set: { count: 1, resetAt, updatedAt: now } },
          { upsert: true, new: true }
        );
      } catch (upsertErr: any) {
        if (upsertErr.code === 11000 || upsertErr.message?.includes('duplicate key')) {
          // Concurrent race condition: another instance initialized the window simultaneously
          record = await RateLimitRecord.findOneAndUpdate(
            { key, resetAt: { $gt: now } },
            { $inc: { count: 1 }, $set: { updatedAt: now } },
            { new: true }
          );
        } else {
          throw upsertErr;
        }
      }
    }

    if (!record) {
      return { allowed: true, count: 1, resetAt: resetAt.getTime(), retryAfterSec: 0 };
    }

    const count = record.count;
    const expiresAtMs = record.resetAt.getTime();
    if (count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000));
      return { allowed: false, count, resetAt: expiresAtMs, retryAfterSec };
    }

    return { allowed: true, count, resetAt: expiresAtMs, retryAfterSec: 0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[RateLimiter] MongoDB RateLimitRecord error:', msg);
    // In case of database error, fallback safely to memory store
    return checkAndIncrementMemoryRateLimit(key, windowMs, max);
  }
}

/**
 * Performs synchronous check & increment against the local in-memory store.
 */
export function checkAndIncrementMemoryRateLimit(
  key: string,
  windowMs: number,
  max: number
): { allowed: boolean; count: number; resetAt: number; retryAfterSec: number } {
  const now = Date.now();
  const record = globalMemoryStore.get(key);

  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    globalMemoryStore.set(key, { attempts: 1, resetAt });
    return { allowed: true, count: 1, resetAt, retryAfterSec: 0 };
  }

  record.attempts++;
  if (record.attempts > max) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, count: record.attempts, resetAt: record.resetAt, retryAfterSec };
  }

  return { allowed: true, count: record.attempts, resetAt: record.resetAt, retryAfterSec: 0 };
}

/**
 * Creates an Express rate-limiting middleware.
 * Supports:
 * - Anti-bypass composite keying (e.g. IP + Account/Email)
 * - Distributed multi-instance MongoDB Atlas persistence
 * - In-memory synchronous fast path for mock DB / unit tests
 * - Standard HTTP 429 status code with Retry-After and RateLimit-* headers
 * - Automated abuse monitoring and threat alerting
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const message = options.message || 'Too many requests. Please try again later.';
  const errorCode = options.errorCode || 'RATE_LIMIT_EXCEEDED';
  const localStore = new Map<string, RateLimitRecordEntry>();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Check test bypass flag
    if (process.env.NODE_ENV === 'test' && process.env.BYPASS_RATE_LIMIT === 'true') {
      next();
      return;
    }

    if (options.skip && options.skip(req)) {
      next();
      return;
    }

    // Resolve key(s)
    let rawKeys: string | string[];
    if (options.keyGenerator) {
      rawKeys = options.keyGenerator(req);
    } else {
      rawKeys = extractClientIp(req);
    }

    const keys = Array.isArray(rawKeys) ? rawKeys.filter(Boolean) : [rawKeys].filter(Boolean);
    if (keys.length === 0) {
      keys.push(extractClientIp(req));
    }

    const isMongoAvailable =
      mongoose.connection.readyState === 1 &&
      !isMockDbAllowed() &&
      options.store !== 'memory';

    // Synchronous In-Memory Fast Path (Default in test/mock mode or when MongoDB is not connected)
    if (!isMongoAvailable) {
      let blockedKey: string | null = null;
      let worstRetryAfter = 0;
      let worstResetAt = 0;

      for (const k of keys) {
        const now = Date.now();
        // Check local store first (for per-instance limiters), then fallback/sync with memory store
        let record = localStore.get(k);
        if (!record || now > record.resetAt) {
          record = { attempts: 1, resetAt: now + options.windowMs };
          localStore.set(k, record);
          globalMemoryStore.set(k, record);
        } else {
          record.attempts++;
          globalMemoryStore.set(k, record);
        }

        if (record.attempts > options.max) {
          const retrySec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
          if (!blockedKey || retrySec > worstRetryAfter) {
            blockedKey = k;
            worstRetryAfter = retrySec;
            worstResetAt = record.resetAt;
          }
        }
      }

      if (blockedKey) {
        res.setHeader('Retry-After', worstRetryAfter.toString());
        res.setHeader('RateLimit-Limit', options.max.toString());
        res.setHeader('RateLimit-Remaining', '0');
        res.setHeader('RateLimit-Reset', Math.ceil(worstResetAt / 1000).toString());

        // Trigger abuse monitoring in background
        const ip = extractClientIp(req);
        const userId = req.user?.id;
        recordAbuseViolation({
          ip,
          userId,
          endpoint: req.originalUrl || req.path,
          reason: `Rate limit exceeded on key [${blockedKey}]`,
        }).catch(() => {});

        res.status(429).json({
          ok: false,
          error: message,
          errorCode,
          retryAfter: worstRetryAfter,
        });
        return;
      }

      // Populate standard non-blocking RateLimit headers
      res.setHeader('RateLimit-Limit', options.max.toString());
      next();
      return;
    }

    // Distributed Asynchronous MongoDB Path (For multi-instance production environments)
    (async () => {
      try {
        let blockedKey: string | null = null;
        let worstRetryAfter = 0;
        let worstResetAt = 0;

        for (const k of keys) {
          const result = await checkAndIncrementMongoRateLimit(k, options.windowMs, options.max);
          if (!result.allowed) {
            if (!blockedKey || result.retryAfterSec > worstRetryAfter) {
              blockedKey = k;
              worstRetryAfter = result.retryAfterSec;
              worstResetAt = result.resetAt;
            }
          }
        }

        if (blockedKey) {
          res.setHeader('Retry-After', worstRetryAfter.toString());
          res.setHeader('RateLimit-Limit', options.max.toString());
          res.setHeader('RateLimit-Remaining', '0');
          res.setHeader('RateLimit-Reset', Math.ceil(worstResetAt / 1000).toString());

          const ip = extractClientIp(req);
          const userId = req.user?.id;
          recordAbuseViolation({
            ip,
            userId,
            endpoint: req.originalUrl || req.path,
            reason: `Distributed rate limit exceeded on key [${blockedKey}]`,
          }).catch(() => {});

          res.status(429).json({
            ok: false,
            error: message,
            errorCode,
            retryAfter: worstRetryAfter,
          });
          return;
        }

        res.setHeader('RateLimit-Limit', options.max.toString());
        next();
      } catch (asyncErr) {
        console.error('[RateLimiter] Unexpected middleware execution error:', asyncErr);
        next();
      }
    })();
  };
}

/**
 * Concurrency limiter to prevent resource exhaustion from simultaneous expensive operations
 * (e.g. concurrent 25MB file uploads, heavy report generation, or parallel database reconciliation).
 */
const inFlightRequestsMap = new Map<string, number>();

export function getInFlightCount(key: string): number {
  return inFlightRequestsMap.get(key) || 0;
}

export function clearInFlightCounts(): void {
  inFlightRequestsMap.clear();
}

export function createConcurrencyLimiter(options: {
  maxConcurrent: number;
  message?: string;
  errorCode?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const message =
    options.message || 'Too many concurrent operations in progress. Please wait for current requests to finish.';
  const errorCode = options.errorCode || 'CONCURRENCY_LIMIT_EXCEEDED';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test' && process.env.BYPASS_RATE_LIMIT === 'true') {
      next();
      return;
    }

    const key = options.keyGenerator ? options.keyGenerator(req) : `global:${req.path}`;
    const current = inFlightRequestsMap.get(key) || 0;

    if (current >= options.maxConcurrent) {
      res.setHeader('Retry-After', '2');
      res.status(429).json({
        ok: false,
        error: message,
        errorCode,
        retryAfter: 2,
      });
      return;
    }

    inFlightRequestsMap.set(key, current + 1);

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        const remaining = Math.max(0, (inFlightRequestsMap.get(key) || 1) - 1);
        if (remaining === 0) {
          inFlightRequestsMap.delete(key);
        } else {
          inFlightRequestsMap.set(key, remaining);
        }
      }
    };

    res.once('finish', release);
    res.once('close', release);

    next();
  };
}

/* ==========================================================================
   TAILORED ENDPOINT RATE LIMITERS
   ========================================================================== */

/**
 * 1. Authentication Rate Limiter (Login, Register, Sync Profile)
 * - 5 attempts per 15 minutes by IP and target email
 * - Prevents credential stuffing, password spraying, and account enumeration
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  errorCode: 'AUTH_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => {
    const ip = extractClientIp(req);
    const email = normalizeEmail(req.body?.email || (req.query?.email as string));
    const keys = [`auth:ip:${ip}`];
    if (email) {
      keys.push(`auth:email:${email}`);
    }
    return keys;
  },
});

/**
 * 2. Strict Date of Birth Verification Rate Limiter (IP level)
 * - 5 attempts per 15 minutes by IP
 */
export const dobRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many incorrect date of birth attempts. Please try again after 15 minutes.',
  errorCode: 'DOB_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => `dob:ip:${extractClientIp(req)}`,
});

/**
 * 3. Email Outbound Action Rate Limiter (Forgot Password, Resend Verification)
 * - Max 3 requests per 15 minutes per target email (stops email inbox bombing)
 * - Max 10 requests per hour per IP (stops automated harvesting/probing)
 */
export const emailActionRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Too many password recovery or verification requests. Please check your inbox or try again later.',
  errorCode: 'EMAIL_ACTION_LIMIT_EXCEEDED',
  keyGenerator: (req) => {
    const ip = extractClientIp(req);
    const email = normalizeEmail(req.body?.email || (req.query?.email as string));
    const keys = [`email_action:ip:${ip}`];
    if (email) {
      keys.push(`email_action:target:${email}`);
    }
    return keys;
  },
});

/**
 * 4. Document File Upload Rate Limiter
 * - 20 uploads per 10 minutes per authenticated user/household
 * - Prevents storage quota abuse, bandwidth saturation, and S3/Supabase billing exhaustion
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: 'Document upload rate limit reached. You can upload up to 20 documents every 10 minutes.',
  errorCode: 'UPLOAD_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `upload:user:${req.user.id}` : `upload:ip:${extractClientIp(req)}`),
});

/**
 * 5. Payment Screenshot Proof Upload Rate Limiter
 * - 5 proof submissions per 15 minutes per user
 * - Protects local disk storage and admin review queue
 */
export const proofUploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Payment proof submission rate limit reached. Please wait before submitting another proof.',
  errorCode: 'PROOF_UPLOAD_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `proof:user:${req.user.id}` : `proof:ip:${extractClientIp(req)}`),
});

/**
 * 6. Document Download URL Generation Rate Limiter
 * - 60 download requests per minute per user
 * - Prevents massive automated scraping and egress bandwidth exhaustion
 */
export const downloadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Document download request limit reached. Please wait a moment before downloading more files.',
  errorCode: 'DOWNLOAD_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `download:user:${req.user.id}` : `download:ip:${extractClientIp(req)}`),
});

/**
 * 7. Payment Initiation Rate Limiter
 * - 10 payment requests per 15 minutes per user
 * - Prevents database pollution with orphaned payment requests and excessive vector QR SVG generation
 */
export const paymentRequestRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Payment initiation rate limit reached. Please complete or cancel your pending payment.',
  errorCode: 'PAYMENT_REQUEST_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `pay_req:user:${req.user.id}` : `pay_req:ip:${extractClientIp(req)}`),
});

/**
 * 8. Price Calculation & Coupon Validation Rate Limiter
 * - 20 calculations per 5 minutes per user/IP
 * - Prevents coupon code dictionary attacks / brute forcing
 */
export const pricingRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: 'Pricing calculation limit reached. Please wait a moment.',
  errorCode: 'PRICING_CALC_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `pricing:user:${req.user.id}` : `pricing:ip:${extractClientIp(req)}`),
});

/**
 * 9. Public Waitlist Submission Rate Limiter
 * - 5 submissions per 15 minutes per IP and phone/email
 * - Protects memory buffer and stops automated spamming
 */
export const waitlistRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Waitlist submission limit reached. Please try again after 15 minutes.',
  errorCode: 'WAITLIST_LIMIT_EXCEEDED',
  keyGenerator: (req) => {
    const ip = extractClientIp(req);
    const contact = (req.body?.phoneOrEmail || '').toString().trim().toLowerCase();
    const keys = [`waitlist:ip:${ip}`];
    if (contact) {
      keys.push(`waitlist:contact:${contact}`);
    }
    return keys;
  },
});

/**
 * 10. Public Contact Form Rate Limiter
 * - 5 inquiries per 15 minutes per IP
 * - Prevents spam bot flooding
 */
export const contactRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Contact inquiry limit reached. Please try again after 15 minutes.',
  errorCode: 'CONTACT_LIMIT_EXCEEDED',
  keyGenerator: (req) => `contact:ip:${extractClientIp(req)}`,
});

/**
 * 11. Search & Catalog Query Rate Limiter
 * - 60 searches per minute per user/admin
 * - Prevents DB CPU exhaustion from repeated regex searches
 */
export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Search query rate limit exceeded. Please wait a moment.',
  errorCode: 'SEARCH_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `search:user:${req.user.id}` : `search:ip:${extractClientIp(req)}`),
});

/**
 * 12. Serverless Cron & Expiry Scheduler Rate Limiter
 * - 10 calls per minute per IP
 * - Prevents unauthorized secret brute-force or rapid batch dispatch cycles
 */
export const cronRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Scheduler trigger rate limit exceeded.',
  errorCode: 'CRON_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => `cron:ip:${extractClientIp(req)}`,
});

/**
 * 13. General API Rate Limiter
 * - 120 calls per minute per authenticated user (or IP)
 * - Provides baseline denial-of-service defense for vault operations
 */
export const generalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'API rate limit exceeded. Please slow down your requests.',
  errorCode: 'API_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `api:user:${req.user.id}` : `api:ip:${extractClientIp(req)}`),
});

/**
 * 14. Sensitive Household & Worker Management Rate Limiter
 * - 30 member/worker/share-pack mutations per 10 minutes per user
 */
export const sensitiveActionRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Action rate limit reached for household resource changes. Please try again in a few minutes.',
  errorCode: 'RESOURCE_ACTION_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `action:user:${req.user.id}` : `action:ip:${extractClientIp(req)}`),
});

/**
 * 15. AI Operations Rate Limiter (Document OCR, Metadata Extraction, Summarization)
 * - 10 AI operations per minute per user/tenant
 * - Concurrency limit 1 per user
 */
export const aiOperationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'AI document processing rate limit reached. Please wait before analyzing more documents.',
  errorCode: 'AI_RATE_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `ai:user:${req.user.id}` : `ai:ip:${extractClientIp(req)}`),
});

/* ==========================================================================
   CONCURRENCY LIMITER INSTANCES
   ========================================================================== */

/**
 * User-level document upload concurrency limiter: Max 2 concurrent uploads per user
 */
export const userUploadConcurrencyLimiter = createConcurrencyLimiter({
  maxConcurrent: 2,
  message: 'You already have document uploads in progress. Please wait for them to finish before uploading more.',
  errorCode: 'CONCURRENT_UPLOAD_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `concur_upload:user:${req.user.id}` : `concur_upload:ip:${extractClientIp(req)}`),
});

/**
 * Global document upload concurrency limiter: Max 5 concurrent uploads server-wide
 * Prevents memory exhaustion on memory-constrained hosting tiers (e.g. 512MB RAM)
 */
export const globalUploadConcurrencyLimiter = createConcurrencyLimiter({
  maxConcurrent: 5,
  message: 'The server is currently processing maximum file upload capacity. Please retry in a few seconds.',
  errorCode: 'GLOBAL_UPLOAD_CAPACITY_EXCEEDED',
  keyGenerator: () => 'global:document_uploads',
});

/**
 * Payment proof upload concurrency limiter: Max 1 concurrent submission per user
 */
export const proofUploadConcurrencyLimiter = createConcurrencyLimiter({
  maxConcurrent: 1,
  message: 'Payment proof upload already in progress. Please wait.',
  errorCode: 'CONCURRENT_PROOF_UPLOAD_LIMIT_EXCEEDED',
  keyGenerator: (req) => (req.user?.id ? `concur_proof:user:${req.user.id}` : `concur_proof:ip:${extractClientIp(req)}`),
});

/**
 * Cron execution concurrency limiter (Mutex: Max 1 in-flight scheduler cycle)
 */
export const cronConcurrencyLimiter = createConcurrencyLimiter({
  maxConcurrent: 1,
  message: 'A scheduler cycle is already currently running.',
  errorCode: 'CRON_CYCLE_ALREADY_IN_PROGRESS',
  keyGenerator: () => 'mutex:scheduler_cron',
});

/**
 * Admin bulk reconciliation concurrency limiter (Mutex: Max 1 in-flight reconciliation)
 */
export const adminReconcileConcurrencyLimiter = createConcurrencyLimiter({
  maxConcurrent: 1,
  message: 'A bulk user reconciliation is already in progress.',
  errorCode: 'RECONCILIATION_ALREADY_IN_PROGRESS',
  keyGenerator: () => 'mutex:admin_reconcile_all',
});

/* ==========================================================================
   ACCOUNT-LEVEL DATE OF BIRTH BRUTE FORCE DEFENSE (Preserved Full API)
   ========================================================================== */

const accountDobStore = new Map<string, RateLimitRecordEntry>();

export function clearAccountDobStore(): void {
  accountDobStore.clear();
}

let testOverrideFailClosed: boolean | null = null;

export function setDobRateLimiterTestOverride(failClosed: boolean | null): void {
  testOverrideFailClosed = failClosed;
}

export async function checkAccountDobRateLimit(
  accountKey: string,
  windowMs = 15 * 60 * 1000,
  maxAttempts = 5
): Promise<{ blocked: boolean; retryAfterSec: number; unavailable?: boolean; error?: string }> {
  if (process.env.NODE_ENV === 'test' && process.env.BYPASS_RATE_LIMIT === 'true') {
    return { blocked: false, retryAfterSec: 0 };
  }

  // 1. Fail closed if database is required and unavailable
  if (testOverrideFailClosed === true || (mongoose.connection.readyState !== 1 && !isMockDbAllowed())) {
    return {
      blocked: true,
      retryAfterSec: 0,
      unavailable: true,
      error: 'Security verification service is temporarily unavailable. Please try again later.',
    };
  }

  const now = Date.now();

  // 2. Persistent MongoDB Atlas distributed check
  if (mongoose.connection.readyState === 1) {
    try {
      const record = await DobLockout.findOne({ accountKey });
      if (record && now < record.lockedUntil.getTime()) {
        if (record.attempts >= maxAttempts) {
          const retryAfterSec = Math.ceil((record.lockedUntil.getTime() - now) / 1000);
          return { blocked: true, retryAfterSec };
        }
      }
      return { blocked: false, retryAfterSec: 0 };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[RateLimiter] MongoDB DobLockout read error:', msg);
      return {
        blocked: true,
        retryAfterSec: 0,
        unavailable: true,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
      };
    }
  }

  // 3. In-memory fallback for unit testing
  const record = accountDobStore.get(accountKey);
  if (!record || now > record.resetAt) {
    return { blocked: false, retryAfterSec: 0 };
  }

  if (record.attempts >= maxAttempts) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return { blocked: true, retryAfterSec };
  }

  return { blocked: false, retryAfterSec: 0 };
}

export async function recordAccountDobFailure(
  accountKey: string,
  windowMs = 15 * 60 * 1000
): Promise<{ success: boolean; attempts?: number; error?: string }> {
  if (testOverrideFailClosed === true || (mongoose.connection.readyState !== 1 && !isMockDbAllowed())) {
    return {
      success: false,
      error: 'Security verification service is temporarily unavailable. Please try again later.',
    };
  }

  const now = Date.now();
  const resetDate = new Date(now + windowMs);

  const memRecord = accountDobStore.get(accountKey);
  let memAttempts = 1;
  if (!memRecord || now > memRecord.resetAt) {
    accountDobStore.set(accountKey, {
      attempts: 1,
      resetAt: now + windowMs,
    });
  } else {
    memRecord.attempts++;
    memAttempts = memRecord.attempts;
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const updated = await DobLockout.findOneAndUpdate(
        { accountKey, lockedUntil: { $gt: new Date(now) } },
        {
          $inc: { attempts: 1 },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      if (updated) {
        return { success: true, attempts: updated.attempts };
      }

      const resetExpired = await DobLockout.findOneAndUpdate(
        { accountKey, lockedUntil: { $lte: new Date(now) } },
        {
          $set: { attempts: 1, lockedUntil: resetDate, updatedAt: new Date() },
        },
        { new: true }
      );

      if (resetExpired) {
        return { success: true, attempts: 1 };
      }

      try {
        const created = await DobLockout.create({
          accountKey,
          attempts: 1,
          lockedUntil: resetDate,
          updatedAt: new Date(),
        });
        return { success: true, attempts: created.attempts };
      } catch (createErr: any) {
        if (createErr.code === 11000 || createErr.message?.includes('duplicate key')) {
          const retried = await DobLockout.findOneAndUpdate(
            { accountKey, lockedUntil: { $gt: new Date(now) } },
            {
              $inc: { attempts: 1 },
              $set: { updatedAt: new Date() },
            },
            { new: true }
          );
          if (retried) {
            return { success: true, attempts: retried.attempts };
          }
          return { success: true, attempts: 1 };
        }
        throw createErr;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[RateLimiter] MongoDB DobLockout write error:', msg);
      return {
        success: false,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
      };
    }
  }

  return { success: true, attempts: memAttempts };
}

export async function clearAccountDobRateLimit(
  accountKey: string
): Promise<{ success: boolean; error?: string }> {
  if (testOverrideFailClosed === true || (mongoose.connection.readyState !== 1 && !isMockDbAllowed())) {
    return {
      success: false,
      error: 'Security verification service is temporarily unavailable. Please try again later.',
    };
  }

  if (mongoose.connection.readyState === 1) {
    try {
      await DobLockout.deleteOne({ accountKey });
      accountDobStore.delete(accountKey);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[RateLimiter] MongoDB DobLockout clear error:', msg);
      return {
        success: false,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
      };
    }
  }

  accountDobStore.delete(accountKey);
  return { success: true };
}
