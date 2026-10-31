import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
import { SEEDED_DOCUMENT_TYPES } from './src/i18n/translations';
import { validateWaitlistInput } from './src/utils/vaultLogic';
import { verifyMailer } from './src/services/mailer';
import { notificationTracker } from './src/services/notificationTracker';
import { startExpiryScheduler, runSchedulerCycle } from './src/services/scheduler';
import { checkAndDispatchDocumentExpiryNotification } from './src/services/expiryDetector';
import { connectDatabase, getDatabaseStatus, ensureDatabaseConnected, startAutoReconnectDaemon } from './src/config/db';
import { registerUser, loginUser, getUserById } from './src/services/authService';
import { requireAuth, householdAuth, extractTokenFromRequest } from './src/middleware/auth';
import { requireSuperAdmin } from './src/middleware/adminAuth';
import {
  authRateLimiter,
  dobRateLimiter,
  emailActionRateLimiter,
  uploadRateLimiter,
  proofUploadRateLimiter,
  downloadRateLimiter,
  paymentRequestRateLimiter,
  pricingRateLimiter,
  waitlistRateLimiter,
  contactRateLimiter,
  searchRateLimiter,
  cronRateLimiter,
  generalApiRateLimiter,
  sensitiveActionRateLimiter,
  userUploadConcurrencyLimiter,
  globalUploadConcurrencyLimiter,
  proofUploadConcurrencyLimiter,
  cronConcurrencyLimiter,
  checkAccountDobRateLimit,
  recordAccountDobFailure,
  clearAccountDobRateLimit,
} from './src/middleware/rateLimiter';
import { verifySupabaseAccessToken, syncMongoProfileFromSupabase } from './src/services/supabaseAuthService';
import { validateDateOfBirth } from './src/utils/dobValidation';
import { evaluateInactivity, isGenuineReauth } from './src/utils/inactivity';
import {
  verifyRecoveryDateOfBirth,
  verifyResetAuthToken,
  consumeResetAuthToken,
  consumeResetAuthTokenAtomic,
} from './src/services/passwordRecoveryService';
import { User, getMockUserBySupabaseId } from './src/models/User';
import { ConsumedResetToken } from './src/models/ConsumedResetToken';
import { DobLockout } from './src/models/DobLockout';
import { getSupabaseStorageClient } from './src/services/supabaseStorage';
import {
  calculatePlanPricing,
  createPaymentRequest,
  submitPaymentProof,
  cancelPaymentRequest,
  getUserCurrentPaymentStatus,
  getUpiPaymentConfig,
  getPaymentProofFile,
} from './src/services/paymentService';
import {
  verifyAndActivateRazorpayPayment,
  processRazorpayWebhook,
} from './src/services/razorpayService';
import {
  timingSafeCompare,
  sanitizeErrorMessage,
  sanitizeQueryString,
  isValidObjectId,
} from './src/utils/securityUtils';
import {
  getBillingOverview,
  getBillingHistory,
  getBillingReceipt,
  cancelUserSubscription,
} from './src/services/billingService';
import { buildUpiPaymentUri, generateQrSvg, generateQrDataUrl } from './src/utils/qrCodeGenerator';
import multer from 'multer';
import {
  listUserDocuments,
  uploadAndCreateDocument,
  getDocumentById,
  generateDocumentDownloadUrl,
  updateDocumentMetadata,
  deleteDocument,
  replaceDocumentFile,
  isValidDocumentId,
  getExpiringDocuments,
  getUserStorageUsage,
} from './src/services/documentService';
import {
  listMembers,
  createMember,
  updateMember,
  deleteMember,
  countHouseholdSeats,
  acceptMemberInvitation,
  getMemberProfile,
  updateMemberOverview,
  updateMemberPersonalDetails,
  SeatLimitExceededError,
  DuplicateMemberError,
  UnauthorizedMemberActionError,
} from './src/services/memberService';
import {
  listWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
} from './src/services/workerService';
import {
  listSharePacks,
  createSharePack,
  deleteSharePack,
} from './src/services/sharePackService';
import { metricsMiddleware, startMonitoringDaemon } from './src/services/monitoringService';
import { adminRouter } from './src/routes/adminRoutes';
import {
  evaluateUserEntitlement,
  validateUploadEntitlement,
  simulateSubscriptionDev,
  releaseQuotaReservation,
  confirmQuotaReservation,
  checkTrialConsumption,
} from './src/services/subscriptionService';
import { runRetentionScan } from './src/services/retentionService';
import {
  getUserSettings,
  updateProfileSettings,
  updateNotificationSettings,
  updateSecuritySettings,
} from './src/services/settingsService';

dotenv.config();

interface WaitlistRecord {
  id: string;
  name: string;
  phoneOrEmail: string;
  familyType: string;
  districtOrCountry: string;
  preferredLang: 'ml' | 'en';
  createdAt: string;
}

const waitlistStore: WaitlistRecord[] = [];

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Reverse-proxy configuration:
  // When explicitly configured for the deployment topology (e.g. Render, Railway, AWS ALB, Nginx),
  // TRUST_PROXY specifies the trusted hops or loopback addresses.
  // Defaults to false to prevent untrusted client X-Forwarded-For header spoofing.
  if (process.env.TRUST_PROXY) {
    const num = parseInt(process.env.TRUST_PROXY, 10);
    app.set('trust proxy', isNaN(num) ? process.env.TRUST_PROXY : num);
  } else {
    app.set('trust proxy', 1);
  }

  // Cross-Origin Resource Sharing (CORS) for decoupled Vercel frontend / Render backend
  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [];

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        configuredOrigins.includes('*') ||
        configuredOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        process.env.NODE_ENV !== 'production';

      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma'
        );
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Protect all standard JSON endpoints from payload-based Denial-of-Service attacks
  // Preserve raw request body buffer for cryptographic webhook signature verification
  app.use(
    express.json({
      limit: '100kb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Global request payload size limit error handler (HTTP 413)
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      res.status(413).json({
        ok: false,
        error: 'Request payload is too large. Maximum allowed size is 100 KB.',
        errorCode: 'PAYLOAD_TOO_LARGE',
      });
      return;
    }
    next(err);
  });

  // Application performance measurement middleware for Real-Time diagnostics
  app.use(metricsMiddleware);

  // Mount centralized Super Admin API router
  app.use('/api/admin', adminRouter);

  // Health & Readiness
  app.get('/api/health', async (_req, res) => {
    const mailerStatus = await verifyMailer();
    const dbStatus = getDatabaseStatus();
    res.json({
      status: 'ok',
      service: 'kudumba-vault-phase-a',
      defaultLocale: process.env.VITE_DEFAULT_LOCALE || 'ml',
      database: {
        connected: dbStatus.connected,
        status: dbStatus.connected ? 'connected' : dbStatus.isMock ? 'mock' : 'disconnected',
      },
      mailer: {
        configured: mailerStatus.configured,
        connected: mailerStatus.connected,
      },
      scheduler: {
        active: true,
        timezone: 'Asia/Kolkata',
        cron: '0 9 * * * (Daily at 9:00 AM IST)',
      },
    });
  });

  // Authentication & Session Management
  app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    if (process.env.NODE_ENV !== 'test') {
      res.status(400).json({
        ok: false,
        error: 'Direct password registration is deprecated. Please register using Supabase Auth.',
      });
      return;
    }
    try {
      const { name, email, password, role, preferredLang } = req.body || {};
      const safeRole = role === 'ADMIN' ? 'USER' : role || 'USER';
      const result = await registerUser({ name, email, password, role: safeRole, preferredLang });

      const isProd = (process.env.NODE_ENV as string) === 'production';
      res.cookie('kv_token', result.token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.status(201).json({
        ok: true,
        user: result.user,
        token: result.token,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('already exists') ? 409 : 400;
      res.status(status).json({ ok: false, error: msg });
    }
  });

  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    if (process.env.NODE_ENV !== 'test') {
      res.status(400).json({
        ok: false,
        error: 'Direct password login is deprecated. Please log in using Supabase Auth.',
      });
      return;
    }
    try {
      const { email, password } = req.body || {};
      const result = await loginUser({ email, password });

      const isProd = (process.env.NODE_ENV as string) === 'production';
      res.cookie('kv_token', result.token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({
        ok: true,
        user: result.user,
        token: result.token,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(401).json({ ok: false, error: msg });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('kv_token', { path: '/' });
    res.clearCookie('sb-access-token', { path: '/' });
    res.json({ ok: true, message: 'Logged out successfully' });
  });

  // Current authenticated user profile
  app.get('/api/auth/me', generalApiRateLimiter, requireAuth, async (req, res) => {
    try {
      const isMockAllowed =
        process.env.NODE_ENV !== 'production' &&
        (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true');

      if (mongoose.connection.readyState !== 1) {
        await ensureDatabaseConnected();
      }

      if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
        res.status(503).json({ ok: false, error: 'Database service is currently unavailable.' });
        return;
      }

      let user: any = null;

      // 1. Resolve MongoDB profile by authenticated supabaseUserId using verified Supabase identity
      if (req.user?.supabaseUserId) {
        user = await User.findOne({ supabaseUserId: req.user.supabaseUserId });
      }

      // 2. Fallback to MongoDB _id for legacy accounts or tests (only if valid ObjectId)
      if (!user && req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
        user = await User.findById(req.user.id);
      }

      // 3. If profile still not found, synchronize profile idempotently
      if (!user && req.user?.supabaseUserId) {
        user = await User.findOrCreateBySupabaseUser({
          supabaseUserId: req.user.supabaseUserId,
          email: req.user.email,
          isEmailVerified: req.user.isEmailVerified,
        });
      }

      if (!user) {
        res.status(404).json({ ok: false, error: 'User profile not found' });
        return;
      }

      const mongoId = user._id ? user._id.toString() : user.id;

      res.json({
        ok: true,
        user: {
          id: mongoId,
          name: user.name,
          fullName: user.fullName || user.name,
          familyName: user.familyName,
          email: user.email,
          role: user.role,
          status: user.status,
          preferredLang: user.preferredLang,
          supabaseUserId: user.supabaseUserId,
          isEmailVerified: true,
          lastActivityAt: user.lastActivityAt,
          createdAt: user.createdAt,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Profile synchronization with Date of Birth validation
  app.post('/api/auth/sync-profile', generalApiRateLimiter, async (req, res) => {
    const token = extractTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }

    const verification = await verifySupabaseAccessToken(token);
    if (!verification.valid || !verification.user) {
      res.status(401).json({ ok: false, error: verification.error || 'Invalid session token.' });
      return;
    }

    if (!verification.user.emailConfirmed) {
      res.status(403).json({
        ok: false,
        error: 'Email verification required. Please check your inbox and verify your email.',
        requiresVerification: true,
        email: verification.user.email,
      });
      return;
    }

    const { fullName, familyName, dateOfBirth, preferredLang } = req.body || {};

    const isMockAllowed =
      process.env.NODE_ENV !== 'production' &&
      (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true');

    if (mongoose.connection.readyState !== 1) {
      await ensureDatabaseConnected();
    }

    if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
      res.status(503).json({ ok: false, error: 'Database service is currently unavailable.' });
      return;
    }

    let normalizedDob: string | undefined = undefined;
    const candidateDob = dateOfBirth || verification.user.metadata?.date_of_birth || verification.user.metadata?.dateOfBirth;
    if (candidateDob) {
      const dobValidation = validateDateOfBirth(candidateDob);
      if (dobValidation.valid && dobValidation.normalized) {
        normalizedDob = dobValidation.normalized;
      } else {
        console.warn(`[SyncProfile] Non-fatal dateOfBirth validation notice for ${verification.user.email}: ${dobValidation.error}. Proceeding without DOB.`);
      }
    }

    try {
      // Security Check: Verify that an inactive (> 7 days) user cannot reset activity without genuine re-auth
      let existingUser: any = null;
      if (mongoose.connection.readyState === 1) {
        existingUser = await User.findOne({ supabaseUserId: verification.user.id });
      }
      if (existingUser && existingUser.lastActivityAt) {
        const inact = evaluateInactivity(existingUser.lastActivityAt);
        if (inact.expired) {
          const genuine = isGenuineReauth(existingUser.lastActivityAt, verification.user.lastSignInAt);
          if (!genuine) {
            res.status(401).json({
              ok: false,
              error: 'Session expired due to 7 consecutive days of inactivity. Please sign in again to unlock your Kudumba Vault.',
              errorCode: 'INACTIVITY_TIMEOUT',
              requiresReauth: true,
              lastActivityAt: existingUser.lastActivityAt,
            });
            return;
          }
        }
      }

      const mongoUser = await User.findOrCreateBySupabaseUser({
        supabaseUserId: verification.user.id,
        email: verification.user.email,
        fullName: fullName || verification.user.metadata?.full_name || verification.user.metadata?.fullName,
        familyName: familyName || verification.user.metadata?.family_name || verification.user.metadata?.familyName,
        dateOfBirth: normalizedDob,
        preferredLang: preferredLang || verification.user.metadata?.preferredLang || 'ml',
        isEmailVerified: verification.user.emailConfirmed,
        touchActivity: true,
        lastSignInAt: verification.user.lastSignInAt,
      });

      const mongoId = mongoUser._id ? mongoUser._id.toString() : mongoUser.id;

      res.json({
        ok: true,
        user: {
          id: mongoId,
          name: mongoUser.name,
          fullName: mongoUser.fullName || mongoUser.name,
          familyName: mongoUser.familyName,
          email: mongoUser.email,
          role: mongoUser.role,
          status: mongoUser.status,
          preferredLang: mongoUser.preferredLang,
          supabaseUserId: mongoUser.supabaseUserId,
          isEmailVerified: verification.user.emailConfirmed,
          lastActivityAt: mongoUser.lastActivityAt,
          createdAt: mongoUser.createdAt,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isDbUnavailable =
        msg.includes('Database') &&
        (msg.includes('unavailable') || msg.includes('not connected') || msg.includes('connection'));
      if (isDbUnavailable) {
        console.error('[Auth] Database unavailable during sync-profile:', msg);
        res.status(503).json({
          ok: false,
          error: 'Database service is currently unavailable. Please ensure MongoDB is connected.',
        });
        return;
      }
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Settings: Fetch authenticated user & household settings
  app.get('/api/settings', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ ok: false, error: 'Authentication required.' });
        return;
      }
      const settings = await getUserSettings(req.user.id);
      res.json({ ok: true, ...settings });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isDbUnavailable =
        msg.includes('Database') &&
        (msg.includes('unavailable') || msg.includes('not connected') || msg.includes('connection'));
      if (isDbUnavailable) {
        res.status(503).json({ ok: false, error: 'Database service is currently unavailable.' });
        return;
      }
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Settings: Update household & profile settings
  app.patch('/api/settings/profile', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ ok: false, error: 'Authentication required.' });
        return;
      }
      const updatedProfile = await updateProfileSettings(req.user.id, req.body || {});
      res.json({ ok: true, profile: updatedProfile });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('must be') ||
        msg.includes('cannot exceed') ||
        msg.includes('Invalid') ||
        msg.includes('required') ||
        msg.includes('forbidden')
      ) {
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      const isDbUnavailable =
        msg.includes('Database') &&
        (msg.includes('unavailable') || msg.includes('not connected') || msg.includes('connection'));
      if (isDbUnavailable) {
        res.status(503).json({ ok: false, error: 'Database service is currently unavailable.' });
        return;
      }
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Settings: Update notification preferences
  app.patch('/api/settings/notifications', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ ok: false, error: 'Authentication required.' });
        return;
      }
      const updatedPrefs = await updateNotificationSettings(req.user.id, req.body || {});
      res.json({ ok: true, notificationPreferences: updatedPrefs });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('must be') || msg.includes('No valid') || msg.includes('Invalid')) {
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      const isDbUnavailable =
        msg.includes('Database') &&
        (msg.includes('unavailable') || msg.includes('not connected') || msg.includes('connection'));
      if (isDbUnavailable) {
        res.status(503).json({ ok: false, error: 'Database service is currently unavailable.' });
        return;
      }
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Settings: Update security preferences
  app.patch('/api/settings/security', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ ok: false, error: 'Authentication required.' });
        return;
      }
      const updatedSec = await updateSecuritySettings(req.user.id, req.body || {});
      res.json({ ok: true, securityPreferences: updatedSec });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('must be') || msg.includes('No valid') || msg.includes('Invalid')) {
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      const isDbUnavailable =
        msg.includes('Database') &&
        (msg.includes('unavailable') || msg.includes('not connected') || msg.includes('connection'));
      if (isDbUnavailable) {
        res.status(503).json({ ok: false, error: 'Database service is currently unavailable.' });
        return;
      }
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Resend email verification
  app.post('/api/auth/resend-verification', emailActionRateLimiter, async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ ok: false, error: 'Valid email address is required.' });
      return;
    }

    try {
      const supabaseAdmin = getSupabaseStorageClient();
      if (supabaseAdmin) {
        await supabaseAdmin.auth.resend({
          type: 'signup',
          email: email.trim().toLowerCase(),
        });
      }
      res.json({
        ok: true,
        message: 'If an unverified account exists, a verification email has been sent.',
      });
    } catch {
      res.json({
        ok: true,
        message: 'If an unverified account exists, a verification email has been sent.',
      });
    }
  });

  // Request password reset foundation (Phase 1)
  app.post('/api/auth/forgot-password', emailActionRateLimiter, async (req, res) => {
    const { email, redirectTo } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ ok: false, error: 'Valid email address is required.' });
      return;
    }

    try {
      const supabaseAdmin = getSupabaseStorageClient();
      if (supabaseAdmin) {
        await supabaseAdmin.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: redirectTo || `${process.env.APP_URL || 'http://localhost:3000'}/reset-password`,
        });
      }
      res.json({
        ok: true,
        message: 'If an account exists with this email, a password recovery code has been sent.',
      });
    } catch {
      res.json({
        ok: true,
        message: 'If an account exists with this email, a password recovery code has been sent.',
      });
    }
  });

  // Step 2: Date-of-Birth Verification Challenge for Password Recovery
  app.post('/api/auth/verify-recovery-dob', dobRateLimiter, async (req, res) => {
    const token = extractTokenFromRequest(req);
    if (!token) {
      res.status(401).json({
        ok: false,
        error: 'Authentication required. Please open the link sent to your registered email.',
      });
      return;
    }

    const verification = await verifySupabaseAccessToken(token);
    if (!verification.valid || !verification.user) {
      res.status(401).json({
        ok: false,
        error: 'Invalid or expired recovery session. Please request a new recovery link.',
      });
      return;
    }

    // Account-level DOB brute force defense: Prevents rotating IP proxies to bypass lockout
    const accountKey = `dob:account:${verification.user.id}`;
    const accountCheck = await checkAccountDobRateLimit(accountKey);
    if (accountCheck.unavailable) {
      res.status(503).json({
        ok: false,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
        errorCode: 'SERVICE_UNAVAILABLE',
      });
      return;
    }
    if (accountCheck.blocked) {
      res.setHeader('Retry-After', accountCheck.retryAfterSec.toString());
      res.status(429).json({
        ok: false,
        error: 'Too many incorrect date of birth attempts for this account. Please try again after 15 minutes.',
        retryAfter: accountCheck.retryAfterSec,
      });
      return;
    }

    const { dateOfBirth } = req.body || {};
    const result = await verifyRecoveryDateOfBirth(
      verification.user.id,
      verification.user.email,
      dateOfBirth
    );

    if (!result.valid) {
      if (result.errorCode === 'DB_UNAVAILABLE') {
        res.status(503).json({
          ok: false,
          error: 'Security verification service is temporarily unavailable. Please try again later.',
          errorCode: 'SERVICE_UNAVAILABLE',
        });
        return;
      }
      const recordResult = await recordAccountDobFailure(accountKey);
      if (!recordResult.success) {
        res.status(503).json({
          ok: false,
          error: 'Security verification service is temporarily unavailable. Please try again later.',
          errorCode: 'SERVICE_UNAVAILABLE',
        });
        return;
      }
      res.status(400).json({
        ok: false,
        error: result.error || 'Invalid date of birth provided.',
      });
      return;
    }

    // Clear failed attempts upon successful verification only after verification succeeds
    const clearResult = await clearAccountDobRateLimit(accountKey);
    if (!clearResult.success) {
      res.status(503).json({
        ok: false,
        error: 'Security verification service is temporarily unavailable. Please try again later.',
        errorCode: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    res.json({
      ok: true,
      message: 'Date of birth verified successfully.',
      resetAuthorizationToken: result.resetAuthorizationToken,
      expiresIn: result.expiresIn,
    });
  });

  // Step 3: Secure Password Reset using official Supabase Auth API
  app.post('/api/auth/reset-password', authRateLimiter, async (req, res) => {
    try {
      const token = extractTokenFromRequest(req);
      if (!token) {
        res.status(401).json({
          ok: false,
          error: 'Authentication required. Please open the link sent to your registered email.',
        });
        return;
      }

      const verification = await verifySupabaseAccessToken(token);
      if (!verification.valid || !verification.user) {
        res.status(401).json({
          ok: false,
          error: 'Invalid or expired recovery session. Please request a new recovery link.',
        });
        return;
      }

      const { resetAuthorizationToken, newPassword, confirmPassword } = req.body || {};

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        res.status(400).json({
          ok: false,
          error: 'New password must be at least 8 characters long.',
        });
        return;
      }

      if (!confirmPassword || typeof confirmPassword !== 'string') {
        res.status(400).json({
          ok: false,
          error: 'Password confirmation is required.',
        });
        return;
      }

      if (newPassword !== confirmPassword) {
        res.status(400).json({
          ok: false,
          error: 'Passwords do not match. Please verify your input.',
        });
        return;
      }

      // Atomically verify and consume the cryptographic one-time-use reset authorization token
      // Guarantees immunity to concurrent race-conditions and multi-instance / restart replay attacks
      const tokenAuth = await consumeResetAuthTokenAtomic(resetAuthorizationToken, verification.user.id);
      if (!tokenAuth.valid) {
        res.status(403).json({
          ok: false,
          error: tokenAuth.error || 'Invalid or expired reset authorization. Please complete date of birth verification.',
          errorCode: tokenAuth.errorCode,
        });
        return;
      }

      // Update password using Supabase Auth's official supported API
      let sessionRevoked = false;
      const supabaseAdmin = getSupabaseStorageClient();
      if (supabaseAdmin) {
        const { error: sbErr } = await supabaseAdmin.auth.admin.updateUserById(
          verification.user.id,
          { password: newPassword }
        );
        if (sbErr) {
          res.status(400).json({ ok: false, error: sbErr.message });
          return;
        }

        // Invalidate and revoke all existing refresh tokens globally across all devices
        try {
          const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(token, 'global');
          if (signOutErr) {
            console.warn('[Auth] Post-password reset session revocation notice:', signOutErr.message);
          } else {
            sessionRevoked = true;
          }
        } catch (revokeErr: unknown) {
          const msg = revokeErr instanceof Error ? revokeErr.message : String(revokeErr);
          console.warn('[Auth] Unexpected error during session revocation:', msg);
        }
      }

      // Touch user's lastActivityAt in MongoDB so fresh credentials activate the profile
      if (mongoose.connection.readyState === 1) {
        await User.findOneAndUpdate(
          { supabaseUserId: verification.user.id },
          { $set: { lastActivityAt: new Date() } }
        );
      } else {
        const mock = getMockUserBySupabaseId(verification.user.id);
        if (mock) {
          mock.lastActivityAt = new Date();
        }
      }

      res.json({
        ok: true,
        message: 'Password successfully updated. Please sign in with your new password.',
        sessionRevoked,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Multer memory storage configuration (25MB limit with field size protections)
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1,
      fields: 25,
      fieldSize: 64 * 1024,
    },
  });

  // Dedicated Payment proof screenshot multer (5MB limit)
  const proofUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 10,
      fieldSize: 16 * 1024,
    },
  });

  const upload = documentUpload;

  // Document Management Endpoints (Supports both Authenticated and Development Household Context)
  app.get('/api/documents', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const { category, status } = req.query as { category?: string; status?: string };
      const docs = await listUserDocuments(req.user!.id, {
        category,
        status: status as any,
      });
      res.json({ ok: true, count: docs.length, documents: docs });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // Storage Usage Accounting Endpoint (Single Source of Truth)
  app.get('/api/documents/storage-usage', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const entitlement = await evaluateUserEntitlement(req.user!.id);
      const stats = await getUserStorageUsage(req.user!.id, entitlement.storageQuotaBytes);
      stats.planName = entitlement.planName;
      res.json({ ok: true, stats, entitlement });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // Trial Eligibility check endpoint for registration
  app.get('/api/auth/trial-eligibility', authRateLimiter, async (req, res) => {
    try {
      const email = typeof req.query.email === 'string' ? req.query.email : '';
      if (!email) {
        res.status(400).json({ ok: false, error: 'Email parameter is required.' });
        return;
      }
      const hasUsedTrial = await checkTrialConsumption(email);
      res.json({
        ok: true,
        hasUsedTrial,
        message: hasUsedTrial
          ? 'This email has already used its free trial. Please sign in and choose a plan to continue using your vault.'
          : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Subscription & Free Trial Status
  app.get('/api/subscription/status', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const entitlement = await evaluateUserEntitlement(req.user!.id);
      res.json({ ok: true, entitlement });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // Development-Only Subscription Simulator (Forbidden in Production)
  app.post('/api/subscription/simulate', householdAuth, async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        ok: false,
        error: 'Subscription simulation is forbidden in production environment.',
      });
      return;
    }
    try {
      const { action } = req.body || {};
      const entitlement = await simulateSubscriptionDev(req.user!.id, action);
      res.json({ ok: true, entitlement });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // --------------------------------------------------------------------------
  // Manual UPI Payments & Subscription Checkout System
  // --------------------------------------------------------------------------

  // 1. Calculate Authoritative Plan Price (Protected against coupon code brute forcing)
  app.post('/api/payments/calculate-price', pricingRateLimiter, householdAuth, async (req, res) => {
    try {
      const { planId, duration, couponCode } = req.body || {};
      if (!planId) {
        res.status(400).json({ ok: false, error: 'Subscription planId is required.' });
        return;
      }
      const pricing = calculatePlanPricing(planId, duration || 'monthly', couponCode);
      res.json({ ok: true, pricing });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // 2. Get Public Receiver UPI Config (UPI ID, merchant name, instructions)
  app.get('/api/payments/config', generalApiRateLimiter, householdAuth, async (_req, res) => {
    try {
      const config = await getUpiPaymentConfig();
      res.json({
        ok: true,
        config: {
          upiId: config.upiId,
          merchantName: config.merchantName,
          qrImageUrl: config.qrImageUrl,
          whatsappNumber: config.whatsappNumber,
          supportEmail: config.supportEmail,
          instructionsEn: config.instructionsEn,
          instructionsMl: config.instructionsMl,
          isEnabled: config.isEnabled,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 3. Create Manual Payment Request
  app.post('/api/payments/request', paymentRequestRateLimiter, householdAuth, async (req, res) => {
    try {
      const { planId, duration, billingAddress, couponCode, saveBillingAddress } = req.body || {};
      if (!planId) {
        res.status(400).json({ ok: false, error: 'planId is required.' });
        return;
      }
      if (!billingAddress) {
        res.status(400).json({ ok: false, error: 'billingAddress is required.' });
        return;
      }
      const request = await createPaymentRequest(req.user!.id, {
        planId,
        duration: duration || 'monthly',
        billingAddress,
        couponCode,
        saveBillingAddress: Boolean(saveBillingAddress),
      });

      // Generate dynamic QR details for immediate payment
      const upiConfig = await getUpiPaymentConfig();
      const upiUri = buildUpiPaymentUri({
        upiId: upiConfig.upiId,
        merchantName: upiConfig.merchantName,
        amount: request.payableAmount,
        refId: request._id ? request._id.toString() : request.id,
      });
      const qrSvg = generateQrSvg(upiUri, { sizePx: 280 });
      const qrDataUrl = generateQrDataUrl(upiUri, { sizePx: 280 });

      res.status(201).json({
        ok: true,
        request,
        upiUri,
        qrSvg,
        qrDataUrl,
        upiConfig: {
          upiId: upiConfig.upiId,
          merchantName: upiConfig.merchantName,
          whatsappNumber: upiConfig.whatsappNumber,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // 4. Get Current Active Payment Status & Saved Billing Details
  app.get('/api/payments/current', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const status = await getUserCurrentPaymentStatus(req.user!.id);
      let upiUri = '';
      let qrSvg = '';
      let qrDataUrl = '';

      if (status.activeRequest && status.activeRequest.status === 'PENDING') {
        upiUri = buildUpiPaymentUri({
          upiId: status.upiConfig.upiId,
          merchantName: status.upiConfig.merchantName,
          amount: status.activeRequest.payableAmount,
          refId: status.activeRequest._id ? status.activeRequest._id.toString() : String((status.activeRequest as any).id || ''),
        });
        qrSvg = generateQrSvg(upiUri, { sizePx: 280 });
        qrDataUrl = generateQrDataUrl(upiUri, { sizePx: 280 });
      }

      res.json({
        ok: true,
        ...status,
        hasPendingRequest: Boolean(status.activeRequest && status.activeRequest.status === 'PENDING'),
        upiUri,
        qrSvg,
        qrDataUrl,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 5. Submit Payment Proof (UTR Number + Screenshot with strict 5MB limit and concurrency control)
  app.post(
    '/api/payments/submit-proof',
    householdAuth,
    proofUploadRateLimiter,
    proofUploadConcurrencyLimiter,
    proofUpload.single('proof'),
    async (req, res) => {
    try {
      const { requestId, utrNumber, paymentDate, remarks } = req.body || {};
      if (!requestId) {
        res.status(400).json({ ok: false, error: 'requestId is required.' });
        return;
      }
      if (!utrNumber) {
        res.status(400).json({ ok: false, error: 'utrNumber is required.' });
        return;
      }
      if (!paymentDate) {
        res.status(400).json({ ok: false, error: 'paymentDate is required.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ ok: false, error: 'Payment screenshot proof is required.' });
        return;
      }

      const updated = await submitPaymentProof(req.user!.id, {
        requestId,
        utrNumber,
        paymentDate,
        remarks,
        file: {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        },
      });

      res.json({
        ok: true,
        message: 'Payment submitted successfully. Your payment is awaiting verification.',
        request: updated,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('belong') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  // 7. Secure Payment Proof Viewing for Users (IDOR-Protected)
  app.get('/api/payments/:id/proof', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const proofInfo = await getPaymentProofFile(req.user!.id, req.params.id, req.user!.role);
      if (!fs.existsSync(proofInfo.filePath)) {
        res.status(404).json({ ok: false, error: 'Payment screenshot not found on storage server.' });
        return;
      }
      const safeFilename = proofInfo.originalName.replace(/[\r\n]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', proofInfo.mimeType);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
      const fileStream = fs.createReadStream(proofInfo.filePath);
      fileStream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: 'Failed to stream payment proof file.' });
        }
      });
      fileStream.pipe(res);
    } catch (err: any) {
      const status = err.statusCode || (String(err?.message).includes('Forbidden') ? 403 : 400);
      const sanitized = sanitizeErrorMessage(err);
      res.status(status).json({ ok: false, error: sanitized.message });
    }
  });

  // 8. Razorpay Payment Verification & Activation (Server-side HMAC verification & replay defense)
  app.post('/api/payments/razorpay/verify', paymentRequestRateLimiter, householdAuth, async (req, res) => {
    try {
      const { paymentId, orderId, subscriptionId, signature, planId, duration, couponCode } = req.body || {};
      if (!paymentId || typeof paymentId !== 'string') {
        res.status(400).json({ ok: false, error: 'paymentId is required.' });
        return;
      }
      if (!signature || typeof signature !== 'string') {
        res.status(400).json({ ok: false, error: 'signature is required.' });
        return;
      }
      if (!planId || typeof planId !== 'string') {
        res.status(400).json({ ok: false, error: 'planId is required.' });
        return;
      }

      const result = await verifyAndActivateRazorpayPayment(req.user!.id, {
        paymentId: paymentId.trim(),
        orderId: orderId ? String(orderId).trim() : undefined,
        subscriptionId: subscriptionId ? String(subscriptionId).trim() : undefined,
        signature: signature.trim(),
        planId: planId.trim(),
        duration,
        couponCode,
      });

      res.json(result);
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      res.status(sanitized.statusCode).json({ ok: false, error: sanitized.message });
    }
  });

  // 9. Razorpay Webhook Event Processing (HMAC-SHA256 signature verification on rawBody & idempotency)
  app.post('/api/payments/razorpay/webhook', async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      if (!signature) {
        res.status(400).json({ ok: false, error: 'Missing x-razorpay-signature header.' });
        return;
      }

      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const result = await processRazorpayWebhook(rawBody, signature);
      res.json(result);
    } catch (err: unknown) {
      const sanitized = sanitizeErrorMessage(err);
      res.status(sanitized.statusCode).json({ ok: false, error: sanitized.message });
    }
  });

  // 6. Cancel User's Pending Payment Request
  app.post('/api/payments/cancel', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const { requestId } = req.body || {};
      if (!requestId) {
        res.status(400).json({ ok: false, error: 'requestId is required.' });
        return;
      }
      await cancelPaymentRequest(req.user!.id, requestId);
      res.json({ ok: true, message: 'Payment request cancelled.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('belong') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  // --------------------------------------------------------------------------
  // Dynamic Billing & Invoicing System
  // --------------------------------------------------------------------------

  // 1. Get Comprehensive Billing Overview
  app.get('/api/billing/overview', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const overview = await getBillingOverview(req.user!.id);
      res.json({ ok: true, ...overview });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 2. Get Paginated Invoices & Billing History
  app.get('/api/billing/history', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const history = await getBillingHistory(req.user!.id, page, limit);
      res.json({ ok: true, ...history });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 3. Get Authorized Official Payment Receipt
  app.get('/api/billing/receipts/:paymentId', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const receipt = await getBillingReceipt(req.user!.id, req.params.paymentId);
      res.json({ ok: true, receipt });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = msg.includes('Unauthorized') ? 403 : msg.includes('not found') ? 404 : 400;
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  // 4. Cancel / Schedule Cancellation of Subscription
  app.post('/api/billing/cancel', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const { cancelAtPeriodEnd = true, reason = '' } = req.body || {};
      const result = await cancelUserSubscription(req.user!.id, cancelAtPeriodEnd, reason);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  app.post(
    ['/api/documents', '/api/documents/upload'],
    householdAuth,
    uploadRateLimiter,
    userUploadConcurrencyLimiter,
    globalUploadConcurrencyLimiter,
    documentUpload.single('file'),
    async (req, res) => {
    let quotaReservationId: string | undefined = undefined;
    try {
      if (!req.file) {
        res.status(400).json({ ok: false, error: 'File attachment is required.' });
        return;
      }

      // Authoritative subscription entitlement & atomic quota reservation check
      const incomingSize = req.file.size ?? req.file.buffer?.length ?? 0;
      const quotaCheck = await validateUploadEntitlement(req.user!.id, incomingSize);
      if (!quotaCheck.allowed) {
        res.status(403).json({
          ok: false,
          error: quotaCheck.reason,
          errorCode: quotaCheck.code || (quotaCheck.reason?.includes('quota') ? 'STORAGE_QUOTA_EXCEEDED' : 'ENTITLEMENT_RESTRICTED'),
          code: quotaCheck.code || (quotaCheck.reason?.includes('quota') ? 'STORAGE_QUOTA_EXCEEDED' : 'ENTITLEMENT_RESTRICTED'),
          quotaExceeded: true,
          entitlement: quotaCheck.entitlement,
        });
        return;
      }
      quotaReservationId = quotaCheck.reservationId;

      const {
        title,
        titleMl,
        category,
        categoryMl,
        ownerNameEn,
        ownerNameMl,
        memberId,
        authorityEn,
        authorityMl,
        docNumber,
        expiryDate,
        issuedAt,
        notes,
        renewalHistory,
      } = req.body || {};

      let parsedRenewalHistory = undefined;
      if (typeof renewalHistory === 'string') {
        try {
          parsedRenewalHistory = JSON.parse(renewalHistory);
        } catch {
          // ignore parse error
        }
      } else if (Array.isArray(renewalHistory)) {
        parsedRenewalHistory = renewalHistory;
      }

      const doc = await uploadAndCreateDocument(req.user!.id, req.file, {
        title,
        titleMl,
        category,
        categoryMl,
        ownerNameEn,
        ownerNameMl,
        memberId,
        authorityEn,
        authorityMl,
        docNumber,
        expiryDate,
        issuedAt,
        notes,
        renewalHistory: parsedRenewalHistory,
      });

      // Confirm the quota reservation now that the document is successfully persisted in MongoDB
      if (quotaReservationId) {
        confirmQuotaReservation(quotaReservationId);
        quotaReservationId = undefined;
      }

      // Notification Hook: Trigger expiry notification immediately if expired (Case A) or expiring soon (Case B)
      if (doc && doc.expiryDate) {
        checkAndDispatchDocumentExpiryNotification({
          document: {
            id: doc.id || doc._id?.toString(),
            title: doc.title,
            category: doc.category,
            docNumber: doc.docNumber,
            authorityEn: doc.authorityEn,
            expiryDate: doc.expiryDate,
            ownerNameEn: doc.ownerNameEn,
            memberId: doc.memberId,
          },
          user: {
            id: req.user!.id,
            email: req.user!.email,
          },
          reason: 'upload',
        }).catch((notifErr) => {
          console.warn('[Notification] Non-blocking upload expiry alert notice:', notifErr?.message || notifErr);
        });
      }

      // Fetch refreshed authoritative storage stats after upload
      let storageStats: any = undefined;
      try {
        storageStats = await getUserStorageUsage(req.user!.id);
      } catch (statsErr) {
        console.warn('[Storage] Non-blocking storage stats refresh error after upload:', statsErr);
      }

      res.status(201).json({ ok: true, document: doc, storageStats });
    } catch (err: unknown) {
      if (quotaReservationId) {
        releaseQuotaReservation(quotaReservationId);
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.get('/api/documents/expiring', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const threshold = req.query.days ? parseInt(String(req.query.days), 10) : 60;
      const docs = await getExpiringDocuments(req.user!.id, threshold);
      res.json({ ok: true, count: docs.length, documents: docs });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.get('/api/documents/:id', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!isValidDocumentId(req.params.id)) {
        res.status(400).json({ ok: false, error: 'Invalid document ID format.' });
        return;
      }
      const doc = await getDocumentById(req.params.id, req.user!.id, req.user!.role);
      if (!doc) {
        res.status(404).json({ ok: false, error: 'Document not found.' });
        return;
      }
      res.json({ ok: true, document: doc });
    } catch (err: any) {
      const status = err.statusCode || 400;
      const sanitized = sanitizeErrorMessage(err);
      res.status(status).json({ ok: false, error: sanitized.message });
    }
  });

  app.get('/api/documents/:id/download', downloadRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!isValidDocumentId(req.params.id)) {
        res.status(400).json({ ok: false, error: 'Invalid document ID format.' });
        return;
      }
      const result = await generateDocumentDownloadUrl(req.params.id, req.user!.id, req.user!.role);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      const status = err.statusCode || 400;
      const sanitized = sanitizeErrorMessage(err);
      res.status(status).json({ ok: false, error: sanitized.message });
    }
  });

  app.put('/api/documents/:id', sensitiveActionRateLimiter, householdAuth, upload.single('file'), async (req, res) => {
    try {
      if (!isValidDocumentId(req.params.id)) {
        res.status(400).json({ ok: false, error: 'Invalid document ID format.' });
        return;
      }

      // If replacement file is attached, update storage object and binary properties
      if (req.file) {
        await replaceDocumentFile(req.params.id, req.user!.id, req.file, req.user!.role);
      }

      const {
        title,
        titleMl,
        category,
        categoryMl,
        ownerNameEn,
        ownerNameMl,
        memberId,
        authorityEn,
        authorityMl,
        docNumber,
        expiryDate,
        issuedAt,
        notes,
        renewalHistory,
      } = req.body || {};

      let parsedRenewalHistory = undefined;
      if (typeof renewalHistory === 'string') {
        try {
          parsedRenewalHistory = JSON.parse(renewalHistory);
        } catch {
          // ignore parse error
        }
      } else if (Array.isArray(renewalHistory)) {
        parsedRenewalHistory = renewalHistory;
      }

      const hasMetadataUpdates =
        title !== undefined ||
        category !== undefined ||
        notes !== undefined ||
        docNumber !== undefined ||
        expiryDate !== undefined ||
        issuedAt !== undefined ||
        ownerNameEn !== undefined ||
        ownerNameMl !== undefined ||
        memberId !== undefined ||
        authorityEn !== undefined ||
        authorityMl !== undefined ||
        titleMl !== undefined ||
        categoryMl !== undefined ||
        parsedRenewalHistory !== undefined;

      let updated = null;
      if (hasMetadataUpdates) {
        updated = await updateDocumentMetadata(
          req.params.id,
          req.user!.id,
          {
            title,
            titleMl,
            category,
            categoryMl,
            ownerNameEn,
            ownerNameMl,
            memberId,
            authorityEn,
            authorityMl,
            docNumber,
            expiryDate,
            issuedAt,
            notes,
            renewalHistory: parsedRenewalHistory,
          },
          req.user!.role
        );
      } else {
        updated = await getDocumentById(req.params.id, req.user!.id, req.user!.role);
      }

      // Notification Hook: Recalculate expiry status and notification eligibility if expiryDate is present (Case E)
      if (updated && updated.expiryDate) {
        checkAndDispatchDocumentExpiryNotification({
          document: {
            id: updated.id || updated._id?.toString() || req.params.id,
            title: updated.title,
            category: updated.category,
            docNumber: updated.docNumber,
            authorityEn: updated.authorityEn,
            expiryDate: updated.expiryDate,
            ownerNameEn: updated.ownerNameEn,
            memberId: updated.memberId,
          },
          user: {
            id: req.user!.id,
            email: req.user!.email,
          },
          reason: 'update',
        }).catch((notifErr) => {
          console.warn('[Notification] Non-blocking update expiry alert notice:', notifErr?.message || notifErr);
        });
      }

      res.json({ ok: true, document: updated });
    } catch (err: any) {
      const status = err.statusCode || 400;
      const sanitized = sanitizeErrorMessage(err);
      res.status(status).json({ ok: false, error: sanitized.message });
    }
  });

  app.delete('/api/documents/:id', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      if (!isValidDocumentId(req.params.id)) {
        res.status(400).json({ ok: false, error: 'Invalid document ID format.' });
        return;
      }
      const result = await deleteDocument(req.params.id, req.user!.id, req.user!.role);
      let storageStats: any = undefined;
      try {
        storageStats = await getUserStorageUsage(req.user!.id);
      } catch (statsErr) {
        console.warn('[Storage] Non-blocking storage stats refresh error after delete:', statsErr);
      }
      res.json({ ok: true, ...result, storageStats });
    } catch (err: any) {
      const status = err.statusCode || 400;
      const sanitized = sanitizeErrorMessage(err);
      res.status(status).json({ ok: false, error: sanitized.message });
    }
  });

  // Profile & Overview / Personal Details Endpoints
  app.get('/api/profile', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const memberId = (req.query.memberId as string) || undefined;
      const profile = await getMemberProfile(req.user!.id, memberId, {
        requesterId: req.user!.id,
        requesterRole: req.user!.role,
      });
      res.json({ ok: true, profile });
    } catch (err: unknown) {
      if (err instanceof UnauthorizedMemberActionError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'UNAUTHORIZED_MEMBER_ACTION',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.patch('/api/profile/overview', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const targetMemberId = req.body.memberId;
      if (!targetMemberId) {
        res.status(400).json({ ok: false, error: 'Member ID is required to update overview.' });
        return;
      }
      const result = await updateMemberOverview(req.user!.id, targetMemberId, req.body, {
        requesterId: req.user!.id,
        requesterRole: req.user!.role,
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      if (err instanceof UnauthorizedMemberActionError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'UNAUTHORIZED_MEMBER_ACTION',
        });
        return;
      }
      if (err instanceof DuplicateMemberError) {
        res.status(409).json({
          ok: false,
          error: err.message,
          errorCode: 'DUPLICATE_MEMBER',
          field: err.field,
          duplicateValue: err.duplicateValue,
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.patch('/api/profile/personal-details', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const targetMemberId = req.body.memberId;
      if (!targetMemberId) {
        res.status(400).json({ ok: false, error: 'Member ID is required to update personal details.' });
        return;
      }
      const result = await updateMemberPersonalDetails(req.user!.id, targetMemberId, req.body, {
        requesterId: req.user!.id,
        requesterRole: req.user!.role,
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      if (err instanceof UnauthorizedMemberActionError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'UNAUTHORIZED_MEMBER_ACTION',
        });
        return;
      }
      if (err instanceof DuplicateMemberError) {
        res.status(409).json({
          ok: false,
          error: err.message,
          errorCode: 'DUPLICATE_MEMBER',
          field: err.field,
          duplicateValue: err.duplicateValue,
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  // Household Member Endpoints
  app.get('/api/members', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const ownerId = req.user!.id;
      const [members, currentSeats, entitlement] = await Promise.all([
        listMembers(ownerId),
        countHouseholdSeats(ownerId),
        evaluateUserEntitlement(ownerId).catch(() => ({ maxFamilyMembers: 5 })),
      ]);
      res.json({
        ok: true,
        count: members.length,
        currentSeats,
        maxSeats: entitlement.maxFamilyMembers || 5,
        members,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/members', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const member = await createMember(
        req.user!.id,
        req.body,
        { requesterId: req.user!.id, requesterRole: req.user!.role }
      );
      res.status(201).json({ ok: true, member });
    } catch (err: unknown) {
      if (err instanceof SeatLimitExceededError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'SEAT_LIMIT_EXCEEDED',
          currentSeats: err.currentSeats,
          maxSeats: err.maxSeats,
          planName: err.planName,
        });
        return;
      }
      if (err instanceof DuplicateMemberError) {
        res.status(409).json({
          ok: false,
          error: err.message,
          errorCode: 'DUPLICATE_MEMBER',
          field: err.field,
          duplicateValue: err.duplicateValue,
        });
        return;
      }
      if (err instanceof UnauthorizedMemberActionError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'UNAUTHORIZED_MEMBER_ACTION',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.post('/api/members/:id/accept-invitation', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const member = await acceptMemberInvitation(
        req.user!.id,
        req.params.id,
        req.user!.id
      );
      res.json({ ok: true, member });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  app.put('/api/members/:id', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const updated = await updateMember(
        req.user!.id,
        req.params.id,
        req.body,
        { requesterId: req.user!.id, requesterRole: req.user!.role }
      );
      res.json({ ok: true, member: updated });
    } catch (err: unknown) {
      if (err instanceof DuplicateMemberError) {
        res.status(409).json({
          ok: false,
          error: err.message,
          errorCode: 'DUPLICATE_MEMBER',
          field: err.field,
          duplicateValue: err.duplicateValue,
        });
        return;
      }
      if (err instanceof UnauthorizedMemberActionError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'UNAUTHORIZED_MEMBER_ACTION',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.delete('/api/members/:id', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const result = await deleteMember(
        req.user!.id,
        req.params.id,
        { requesterId: req.user!.id, requesterRole: req.user!.role }
      );
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      if (err instanceof UnauthorizedMemberActionError) {
        res.status(403).json({
          ok: false,
          error: err.message,
          errorCode: 'UNAUTHORIZED_MEMBER_ACTION',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  // Service Worker Directory Endpoints
  app.get('/api/workers', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const workers = await listWorkers(req.user!.id);
      res.json({ ok: true, count: workers.length, workers });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/workers', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const worker = await createWorker(req.user!.id, req.body);
      res.status(201).json({ ok: true, worker });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.put('/api/workers/:id', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const updated = await updateWorker(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, worker: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.delete('/api/workers/:id', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const result = await deleteWorker(req.user!.id, req.params.id);
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  // Share Pack Endpoints
  app.get('/api/share-packs', generalApiRateLimiter, householdAuth, async (req, res) => {
    try {
      const packs = await listSharePacks(req.user!.id);
      res.json({ ok: true, count: packs.length, sharePacks: packs });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/api/share-packs', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const pack = await createSharePack(req.user!.id, req.body);
      res.status(201).json({ ok: true, sharePack: pack });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  app.delete('/api/share-packs/:id', sensitiveActionRateLimiter, householdAuth, async (req, res) => {
    try {
      const result = await deleteSharePack(req.user!.id, req.params.id);
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const statusCode = (err as any)?.statusCode || (msg.includes('Forbidden') || msg.includes('access denied') ? 403 : msg.includes('not found') ? 404 : 400);
      res.status(statusCode).json({ ok: false, error: msg });
    }
  });

  function timingSafeTokenCheck(provided: string, expected: string): boolean {
    if (!provided || !expected || provided.length !== expected.length) {
      return false;
    }
    try {
      return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // Secure Administrative Diagnostics & Tracking (Protected by Cron Secret / Super Admin Token & Rate Limiter)
  app.get('/api/admin/notifications', cronRateLimiter, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const cronSecret = (process.env.CRON_SECRET || '').trim();

    // Constant-time verification of CRON_SECRET token
    if (timingSafeTokenCheck(token, cronSecret)) {
      const records = notificationTracker.getAllRecords();
      res.json({
        ok: true,
        total: records.length,
        records: records.slice(-50), // Return recent 50
      });
      return;
    }

    // Deny access by default: require authenticated Super Admin
    return requireSuperAdmin(req, res, () => {
      const records = notificationTracker.getAllRecords();
      res.json({
        ok: true,
        total: records.length,
        records: records.slice(-50), // Return recent 50
      });
    });
  });

  // Scheduled Webhook / Manual Trigger for Serverless Cron Platforms (Protected by Cron Secret / Super Admin with concurrency lock)
  app.post('/api/cron/expiry-check', cronRateLimiter, cronConcurrencyLimiter, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const cronSecret = (process.env.CRON_SECRET || '').trim();

    // Deny access by default: if CRON_SECRET is missing or token does not match in constant time, require Super Admin
    if (!timingSafeTokenCheck(token, cronSecret)) {
      return requireSuperAdmin(req, res, async () => {
        try {
          const report = await runSchedulerCycle();
          res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            report,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          res.status(500).json({ ok: false, error: message });
        }
      });
    }

    try {
      const report = await runSchedulerCycle();
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        report,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // Data-driven Region & Document Type Catalog
  app.get('/api/catalog', generalApiRateLimiter, (_req, res) => {
    res.json({
      regions: [
        { code: 'KL-IN', nameEn: 'Kerala, India', nameMl: 'കേരളം, ഇന്ത്യ' },
        { code: 'GCC', nameEn: 'Gulf Cooperation Council (UAE, KSA, Qatar, Oman, Kuwait, Bahrain)', nameMl: 'ഗൾഫ് രാജ്യങ്ങൾ (GCC)' },
      ],
      documentTypes: SEEDED_DOCUMENT_TYPES,
    });
  });

  // Waitlist & Founding Household Registration
  app.get('/api/waitlist', generalApiRateLimiter, (_req, res) => {
    res.json({
      count: 146 + waitlistStore.length,
      recentLocations: ['Ernakulam', 'Dubai (UAE)', 'Kozhikode', 'Thrissur', 'Riyadh (KSA)'],
    });
  });

  app.post('/api/waitlist', waitlistRateLimiter, (req, res) => {
    const check = validateWaitlistInput(req.body || {});
    if (!check.valid) {
      res.status(400).json({ error: check.errorEn, errorMl: check.errorMl });
      return;
    }

    const record: WaitlistRecord = {
      id: `wl-${Date.now()}`,
      name: String(req.body.name).trim().slice(0, 100),
      phoneOrEmail: String(req.body.phoneOrEmail).trim().slice(0, 120),
      familyType: String(req.body.familyType || 'KERALA_RESIDENT'),
      districtOrCountry: String(req.body.districtOrCountry).trim().slice(0, 100),
      preferredLang: req.body.preferredLang === 'en' ? 'en' : 'ml',
      createdAt: new Date().toISOString(),
    };
    waitlistStore.push(record);
    // Bounded memory protection against unbounded array growth / Out-of-Memory DoS
    if (waitlistStore.length > 1000) {
      waitlistStore.shift();
    }

    res.status(201).json({
      ok: true,
      count: 146 + waitlistStore.length,
      entry: {
        id: record.id,
        familyType: record.familyType,
        districtOrCountry: record.districtOrCountry,
        preferredLang: record.preferredLang,
      },
    });
  });

  // Contact Inquiry Endpoint (Protected by rate limiting & strict string length bounds)
  app.post('/api/contact', contactRateLimiter, (req, res) => {
    const { name, phoneOrEmail, message } = req.body || {};
    if (!name || !phoneOrEmail || !message) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    if (typeof name !== 'string' || name.trim().length > 100) {
      res.status(400).json({ error: 'Name must not exceed 100 characters.' });
      return;
    }
    if (typeof phoneOrEmail !== 'string' || phoneOrEmail.trim().length > 120) {
      res.status(400).json({ error: 'Contact detail must not exceed 120 characters.' });
      return;
    }
    if (typeof message !== 'string' || message.trim().length > 2000) {
      res.status(400).json({ error: 'Message must not exceed 2000 characters.' });
      return;
    }
    res.status(201).json({ ok: true, receivedAt: new Date().toISOString() });
  });

  // Centralized Multer upload error handler (Returns HTTP 413 for size limit violations)
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          ok: false,
          error: 'Uploaded file exceeds maximum permitted size limit.',
          errorCode: 'FILE_SIZE_LIMIT_EXCEEDED',
        });
        return;
      }
      res.status(400).json({
        ok: false,
        error: `File upload validation failed: ${err.message}`,
        errorCode: 'FILE_UPLOAD_ERROR',
      });
      return;
    }
    next(err);
  });

  // Centralized unhandled application error handler (Strips database internals, hostnames, stack traces)
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const sanitized = sanitizeErrorMessage(err);
    console.error(`[UnhandledError] ${req.method} ${req.originalUrl}:`, err?.message || err);
    res.status(sanitized.statusCode).json({
      ok: false,
      error: sanitized.message,
    });
  });

  // SEO Sitemap & Robots.txt
  app.get('/sitemap.xml', (_req, res) => {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const pages = [
      '',
      'features',
      'how-it-works',
      'pricing',
      'security',
      'for-nris',
      'for-partners',
      'faq',
      'contact',
      'privacy',
      'terms',
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${baseUrl}/${p}</loc>
    <changefreq>weekly</changefreq>
    <priority>${p === '' ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
    res.header('Content-Type', 'application/xml').send(xml);
  });

  app.get('/robots.txt', (_req, res) => {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  if (process.env.NODE_ENV !== 'production') {
    // Redirect root URL (http://localhost:3000/) directly to /welcome marketing landing page in dev
    app.get('/', (_req, res) => {
      res.redirect('/welcome');
    });

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtml = path.join(distPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      app.get('/', (_req, res) => {
        res.redirect('/welcome');
      });
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({
          status: 'ok',
          service: 'Kudumba Vault Backend API',
          environment: 'production',
          message: 'Backend is operational. Connect your frontend via VITE_API_BASE_URL.',
        });
      });
    }
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Kudumba Vault server running on http://localhost:${PORT}`);

    // Verify SMTP connection safely without crashing server if offline
    try {
      const mailerStatus = await verifyMailer();
      if (mailerStatus.configured && mailerStatus.connected) {
        console.log(`[Mailer] Gmail SMTP connected successfully as: ${mailerStatus.user}`);
      } else if (mailerStatus.configured && !mailerStatus.connected) {
        console.warn(`[Mailer] Gmail SMTP connection failed: ${mailerStatus.error}`);
      } else {
        console.log('[Mailer] Gmail credentials not set; mailer running in safe json/mock mode.');
      }
    } catch (err) {
      console.warn('[Mailer] Verification check encountered error:', err);
    }

    // Start automated background scheduler (Runs every day at 9:00 AM Asia/Kolkata)
    startExpiryScheduler();

    // Start background system metric sampling daemon (persists metrics every 60s)
    startMonitoringDaemon(60);

    // Start background MongoDB auto-reconnect daemon
    startAutoReconnectDaemon(10000);
  });

  // Initialize database connection safely without blocking HTTP server startup
  connectDatabase()
    .then(async (dbStatus) => {
      if (dbStatus.connected && !dbStatus.isMock) {
        await Promise.all([
          ConsumedResetToken.createIndexes().catch((err: any) => {
            console.warn('[MongoDB] ConsumedResetToken index verification notice:', err.message);
          }),
          DobLockout.createIndexes().catch((err: any) => {
            console.warn('[MongoDB] DobLockout index verification notice:', err.message);
          }),
        ]);
      } else if (!dbStatus.connected && !dbStatus.isMock) {
        console.warn(
          '[MongoDB] Server started without active database connection. Real database requests will fail until reconnected.'
        );
      }
    })
    .catch((dbErr) => {
      console.error('[MongoDB] Database initialization error:', dbErr);
    });
}

startServer();
