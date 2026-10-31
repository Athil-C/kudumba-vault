import mongoose, { Types } from 'mongoose';
import { Subscription, ISubscription, SubscriptionStatus, RetentionStatus } from '../models/Subscription';
import { TrialConsumption } from '../models/TrialConsumption';
import { AUTHORITATIVE_PLANS, DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_PERIOD_HOURS, getPlanConfig, PlanConfiguration } from '../config/planConfig';
import { getUserStorageUsage } from './documentService';
import { User, isMockDbAllowed, findMockUserById } from '../models/User';
import { UserSettings, getMockUserSettingsByUserId } from '../models/UserSettings';
import { AdminAuditEvent } from '../models/AdminAuditEvent';
import { sendEmail } from './mailer';

export interface EntitlementStatus {
  subscriptionId?: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  isActiveOrTrialing: boolean;
  isTrialing: boolean;
  trialStart?: string;
  trialEnd?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  cancellationMode?: 'END_OF_PERIOD' | 'IMMEDIATE';
  cancellationReason?: string;
  cancelledAt?: string;
  cancellationRequestedAt?: string;
  gracePeriodEnd?: string;
  retentionStatus?: RetentionStatus;
  inGracePeriod?: boolean;
  gracePeriodExpired?: boolean;
  hoursRemainingInGrace?: number;
  daysRemainingInTrial: number;
  hoursRemainingInTrial?: number;
  trialExpired: boolean;
  trialConsumed: boolean;
  canUpload: boolean;
  canDownloadOrView: boolean;
  storageQuotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
  maxFileSizeBytes: number;
  maxFamilyMembers: number;
  maxDocuments?: number;
  currentDocumentCount?: number;
  featuresEn: string[];
  featuresMl: string[];
  priceInr: number;
  cadence: 'FREE' | 'MONTHLY' | 'ANNUAL';
  isSimulatedDev: boolean;
}

// In-memory mock trial consumption storage for unit test environments
const mockTrialConsumptions = new Map<string, any>();

// In-memory mock subscription storage for unit test environments
const mockSubscriptions = new Map<string, any>();

// In-memory active quota reservations map: key = reservationId, val = { userId, bytes, expiresAt }
export interface QuotaReservation {
  reservationId: string;
  userId: string;
  bytes: number;
  expiresAt: number;
}
const activeReservations = new Map<string, QuotaReservation>();
// 10-minute window for multi-part / high-res uploads to prevent premature reservation expiration
const RESERVATION_TTL_MS = 10 * 60 * 1000;

/**
 * Clean up expired upload reservations
 */
function cleanupExpiredReservations() {
  const now = Date.now();
  for (const [id, res] of activeReservations.entries()) {
    if (res.expiresAt <= now) {
      activeReservations.delete(id);
    }
  }
}

/**
 * Gets total currently reserved bytes for a given user
 */
export function getReservedBytes(userId: string): number {
  cleanupExpiredReservations();
  let total = 0;
  for (const res of activeReservations.values()) {
    if (res.userId === userId) {
      total += res.bytes;
    }
  }
  return total;
}

/**
 * Gets total currently active in-flight upload reservations for a user
 */
export function getReservedUploadCount(userId: string): number {
  cleanupExpiredReservations();
  let count = 0;
  for (const res of activeReservations.values()) {
    if (res.userId === userId) {
      count += 1;
    }
  }
  return count;
}

/**
 * Atomically reserves quota for an incoming upload before streaming to Supabase Storage.
 */
export function reserveQuota(userId: string, bytes: number): string {
  cleanupExpiredReservations();
  const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  activeReservations.set(reservationId, {
    reservationId,
    userId,
    bytes,
    expiresAt: Date.now() + RESERVATION_TTL_MS,
  });
  return reservationId;
}

/**
 * Releases a quota reservation (e.g. on upload failure or cancellation)
 */
export function releaseQuotaReservation(reservationId: string) {
  activeReservations.delete(reservationId);
}

/**
 * Confirms a quota reservation after successful file persistence in MongoDB
 */
export function confirmQuotaReservation(reservationId: string) {
  activeReservations.delete(reservationId);
}

/**
 * Valid transitions between Subscription statuses:
 * trialing -> active | expired | canceled
 * pending_payment -> active | past_due | canceled | expired
 * active -> past_due | canceled | expired
 * past_due -> active | canceled | expired
 * canceled -> pending_payment | active
 * expired -> pending_payment | active
 */
const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ['active', 'expired', 'canceled', 'pending_payment'],
  pending_payment: ['active', 'past_due', 'canceled', 'expired'],
  active: ['past_due', 'canceled', 'expired'],
  past_due: ['active', 'canceled', 'expired'],
  canceled: ['pending_payment', 'active'],
  expired: ['pending_payment', 'active'],
};

export function isValidSubscriptionTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Checks if an email has already consumed its free trial.
 * Uses the durable TrialConsumption collection to enforce trial limits even if
 * a user or subscription document is deleted.
 */
export async function checkTrialConsumption(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return false;

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    return mockTrialConsumptions.has(cleanEmail);
  }

  const record = await TrialConsumption.findOne({ email: cleanEmail });
  return Boolean(record);
}

/**
 * Records trial consumption for an email address idempotently.
 */
export async function recordTrialConsumption(
  email: string,
  userId?: string,
  reason: 'verified_signup' | 'trial_started' | 'migration' = 'trial_started'
): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return;

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    mockTrialConsumptions.set(cleanEmail, {
      email: cleanEmail,
      userId,
      consumedAt: new Date(),
      trialDurationDays: DEFAULT_TRIAL_DAYS,
      reason,
    });
    return;
  }

  await TrialConsumption.findOneAndUpdate(
    { email: cleanEmail },
    {
      $setOnInsert: {
        email: cleanEmail,
        userId: userId ? new Types.ObjectId(userId) : undefined,
        consumedAt: new Date(),
        trialDurationDays: DEFAULT_TRIAL_DAYS,
        reason,
      },
    },
    { upsert: true }
  );
}

/**
 * Ensures a subscription exists for an authenticated, email-verified user.
 * Idempotently creates a 3-day free trial on first verified access with 48-hour grace period.
 * Guarantees atomic trial creation under concurrent requests using atomic findOneAndUpdate upsert.
 */
export async function getOrCreateUserSubscription(userId: string, userEmail?: string): Promise<ISubscription | any> {
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    if (mockSubscriptions.has(userId)) {
      return mockSubscriptions.get(userId);
    }
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const gracePeriodEnd = new Date(trialEnd.getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);

    const mockSub = {
      _id: `sub-${userId}`,
      userId,
      userEmail: userEmail || undefined,
      planId: 'founding-free',
      planName: AUTHORITATIVE_PLANS['founding-free'].nameEn,
      maxFamilyMembers: AUTHORITATIVE_PLANS['founding-free'].maxFamilyMembers,
      status: 'trialing' as SubscriptionStatus,
      priceInr: 0,
      cadence: 'FREE',
      trialStart,
      trialEnd,
      trialConsumed: true,
      gracePeriodEnd,
      retentionStatus: 'trial_active' as RetentionStatus,
      deletionScheduledAt: undefined as Date | undefined,
      currentPeriodStart: trialStart,
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
      cancellationMode: undefined as 'END_OF_PERIOD' | 'IMMEDIATE' | undefined,
      cancellationReason: undefined as string | undefined,
      cancelledAt: undefined as Date | undefined,
      cancellationRequestedAt: undefined as Date | undefined,
      previousStatus: undefined as string | undefined,
      metadata: {} as Record<string, any>,
      isSimulatedDev: false,
      save: async function () {
        mockSubscriptions.set(userId, this);
        return this;
      },
    };
    mockSubscriptions.set(userId, mockSub);
    if (userEmail) {
      recordTrialConsumption(userEmail, userId);
    }
    return mockSub;
  }

  // Use atomic findOneAndUpdate with upsert to prevent duplicate subscription creation under concurrent requests
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const gracePeriodEnd = new Date(trialEnd.getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);

  const sub = await Subscription.findOneAndUpdate(
    { userId: new Types.ObjectId(userId) },
    {
      $setOnInsert: {
        userId: new Types.ObjectId(userId),
        planId: 'founding-free',
        planName: AUTHORITATIVE_PLANS['founding-free'].nameEn,
        maxFamilyMembers: AUTHORITATIVE_PLANS['founding-free'].maxFamilyMembers,
        status: 'trialing',
        priceInr: 0,
        cadence: 'FREE',
        trialStart,
        trialEnd,
        trialConsumed: true,
        gracePeriodEnd,
        retentionStatus: 'trial_active',
        currentPeriodStart: trialStart,
        currentPeriodEnd: trialEnd,
        cancelAtPeriodEnd: false,
        isSimulatedDev: false,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  if (userEmail) {
    await recordTrialConsumption(userEmail, userId);
  }

  return sub;
}

/**
 * Calculates authoritative user entitlement, trial state, grace period and quota headroom.
 */
export async function evaluateUserEntitlement(userId: string): Promise<EntitlementStatus> {
  const sub = await getOrCreateUserSubscription(userId);
  const plan = getPlanConfig(sub.planId);

  const now = Date.now();
  let status: SubscriptionStatus = sub.status;
  let isTrialing = status === 'trialing';
  let trialExpired = status === 'expired';
  let daysRemainingInTrial = 0;
  let hoursRemainingInTrial = 0;

  // Calculate Grace Period boundaries (trialEnd + 48 hours)
  const trialEndTime = sub.trialEnd ? new Date(sub.trialEnd).getTime() : 0;
  const gracePeriodEndTime = sub.gracePeriodEnd
    ? new Date(sub.gracePeriodEnd).getTime()
    : trialEndTime + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000;

  let inGracePeriod = false;
  let gracePeriodExpired = false;
  let hoursRemainingInGrace = 0;
  let retentionStatus: RetentionStatus = sub.retentionStatus || (status === 'active' ? 'retained_paid' : 'trial_active');

  if (status === 'active') {
    retentionStatus = 'retained_paid';
    // If subscription was scheduled to cancel at period end and current period has expired, transition to expired
    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && now >= new Date(sub.currentPeriodEnd).getTime()) {
      status = 'expired';
      retentionStatus = 'in_grace_period';
      let shouldSave = false;
      if (sub.status !== 'expired') {
        sub.status = 'expired';
        shouldSave = true;
      }
      if (sub.retentionStatus !== retentionStatus) {
        sub.retentionStatus = retentionStatus;
        shouldSave = true;
      }
      if (shouldSave && typeof sub.save === 'function') {
        await sub.save();
      }
    }
  } else if (isTrialing && sub.trialEnd) {
    if (now >= trialEndTime) {
      status = 'expired';
      isTrialing = false;
      trialExpired = true;
      daysRemainingInTrial = 0;
      hoursRemainingInTrial = 0;

      // Check Grace Period status
      if (now < gracePeriodEndTime) {
        inGracePeriod = true;
        gracePeriodExpired = false;
        retentionStatus = 'in_grace_period';
        hoursRemainingInGrace = Math.max(0, Math.ceil((gracePeriodEndTime - now) / (1000 * 60 * 60)));
      } else {
        inGracePeriod = false;
        gracePeriodExpired = true;
        retentionStatus = 'grace_expired';
        hoursRemainingInGrace = 0;
      }

      // Persist state updates and transition to Founding Free plan limits
      let shouldSave = false;
      if (sub.status !== 'expired') {
        sub.status = 'expired';
        shouldSave = true;
      }
      if (sub.planId !== 'founding-free') {
        sub.planId = 'founding-free';
        sub.planName = AUTHORITATIVE_PLANS['founding-free'].nameEn;
        sub.maxFamilyMembers = AUTHORITATIVE_PLANS['founding-free'].maxFamilyMembers;
        shouldSave = true;
      }
      if (!sub.gracePeriodEnd) {
        sub.gracePeriodEnd = new Date(gracePeriodEndTime);
        shouldSave = true;
      }
      if (sub.retentionStatus !== retentionStatus) {
        sub.retentionStatus = retentionStatus;
        shouldSave = true;
      }
      if (shouldSave && typeof sub.save === 'function') {
        await sub.save();
      }
    } else {
      const msRemaining = trialEndTime - now;
      daysRemainingInTrial = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      hoursRemainingInTrial = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));
      retentionStatus = 'trial_active';
    }
  } else if (status === 'expired') {
    trialExpired = true;
    if (now < gracePeriodEndTime) {
      inGracePeriod = true;
      gracePeriodExpired = false;
      retentionStatus = 'in_grace_period';
      hoursRemainingInGrace = Math.max(0, Math.ceil((gracePeriodEndTime - now) / (1000 * 60 * 60)));
    } else {
      inGracePeriod = false;
      gracePeriodExpired = true;
      retentionStatus = 'grace_expired';
      hoursRemainingInGrace = 0;
    }
  }

  // Only real 'active' or valid 'trialing' subscriptions grant upload entitlement
  let effectiveStatus = status;
  if (sub.isSimulatedDev && process.env.NODE_ENV === 'production') {
    effectiveStatus = 'expired';
  }
  const isActiveOrTrialing = effectiveStatus === 'active' || effectiveStatus === 'trialing';

  // Compute real persisted storage usage
  const usage = await getUserStorageUsage(userId, plan.storageQuotaBytes);
  // Account for in-flight reserved bytes
  const reservedBytes = getReservedBytes(userId);
  const effectiveUsed = usage.usedBytes + reservedBytes;
  const availableBytes = Math.max(0, plan.storageQuotaBytes - effectiveUsed);

  return {
    subscriptionId: sub._id?.toString(),
    planId: plan.id,
    planName: plan.nameEn,
    status,
    isActiveOrTrialing,
    isTrialing,
    trialStart: sub.trialStart ? new Date(sub.trialStart).toISOString() : undefined,
    trialEnd: sub.trialEnd ? new Date(sub.trialEnd).toISOString() : undefined,
    currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toISOString() : undefined,
    currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : undefined,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    cancellationMode: sub.cancellationMode,
    cancellationReason: sub.cancellationReason,
    cancelledAt: sub.cancelledAt ? new Date(sub.cancelledAt).toISOString() : undefined,
    cancellationRequestedAt: sub.cancellationRequestedAt ? new Date(sub.cancellationRequestedAt).toISOString() : undefined,
    gracePeriodEnd: sub.gracePeriodEnd
      ? new Date(sub.gracePeriodEnd).toISOString()
      : trialEndTime
      ? new Date(trialEndTime + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString()
      : undefined,
    retentionStatus,
    inGracePeriod,
    gracePeriodExpired,
    hoursRemainingInGrace,
    daysRemainingInTrial,
    hoursRemainingInTrial,
    trialExpired,
    trialConsumed: Boolean(sub.trialConsumed),
    canUpload: isActiveOrTrialing && availableBytes > 0,
    canDownloadOrView: true, // Users never lose access to their existing documents
    storageQuotaBytes: plan.storageQuotaBytes,
    usedBytes: usage.usedBytes,
    reservedBytes,
    availableBytes,
    maxFileSizeBytes: plan.maxFileSizeBytes,
    maxFamilyMembers: plan.maxFamilyMembers,
    maxDocuments: plan.maxDocuments,
    currentDocumentCount: usage.documentCount,
    featuresEn: plan.featuresEn,
    featuresMl: plan.featuresMl,
    priceInr: plan.priceInr,
    cadence: plan.cadence,
    isSimulatedDev: Boolean(sub.isSimulatedDev),
  };
}

/**
 * Validates whether an incoming file upload satisfies both subscription entitlement and storage quota.
 * Atomically reserves quota for the upload duration if valid.
 */
export async function validateUploadEntitlement(userId: string, incomingSizeBytes: number): Promise<{
  allowed: boolean;
  reason?: string;
  code?: string;
  reservationId?: string;
  entitlement: EntitlementStatus;
}> {
  const entitlement = await evaluateUserEntitlement(userId);

  if (!entitlement.isActiveOrTrialing) {
    return {
      allowed: false,
      reason: 'Your free trial has expired. Upgrade your plan to resume uploading documents.',
      entitlement,
    };
  }

  // Document count limit enforcement (Founding Free tier allows at most 3 eligible documents)
  if (typeof entitlement.maxDocuments === 'number') {
    const inFlightCount = getReservedUploadCount(userId);
    const totalProjectedDocs = (entitlement.currentDocumentCount || 0) + inFlightCount;
    if (totalProjectedDocs >= entitlement.maxDocuments) {
      return {
        allowed: false,
        code: 'DOCUMENT_LIMIT_REACHED',
        reason: `Your Free plan allows up to ${entitlement.maxDocuments} documents. Upgrade your plan to upload more.`,
        entitlement,
      };
    }
  }

  if (incomingSizeBytes > entitlement.maxFileSizeBytes) {
    return {
      allowed: false,
      reason: `File size exceeds the plan limit of ${Math.round(entitlement.maxFileSizeBytes / (1024 * 1024))} MB.`,
      entitlement,
    };
  }

  if (entitlement.usedBytes + entitlement.reservedBytes + incomingSizeBytes > entitlement.storageQuotaBytes) {
    return {
      allowed: false,
      reason: `Storage quota exceeded. Available: ${Math.round(entitlement.availableBytes / (1024 * 1024))} MB. File: ${Math.round(incomingSizeBytes / (1024 * 1024))} MB.`,
      entitlement,
    };
  }

  // Atomically reserve the quota to prevent simultaneous race conditions
  const reservationId = reserveQuota(userId, incomingSizeBytes);

  return { allowed: true, reservationId, entitlement };
}

/**
 * Development-Only Subscription Simulator.
 * Strictly rejected if NODE_ENV === 'production'.
 */
export async function simulateSubscriptionDev(
  userId: string,
  action: 'START_TRIAL' | 'EXPIRE_TRIAL' | 'SIMULATE_UPGRADE' | 'CANCEL'
): Promise<EntitlementStatus> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Subscription simulator is strictly forbidden in production.');
  }

  const sub = await getOrCreateUserSubscription(userId);

  switch (action) {
    case 'START_TRIAL': {
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const gracePeriodEnd = new Date(trialEnd.getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
      sub.status = 'trialing';
      sub.planId = 'founding-free';
      sub.planName = AUTHORITATIVE_PLANS['founding-free'].nameEn;
      sub.maxFamilyMembers = AUTHORITATIVE_PLANS['founding-free'].maxFamilyMembers;
      sub.trialStart = trialStart;
      sub.trialEnd = trialEnd;
      sub.gracePeriodEnd = gracePeriodEnd;
      sub.retentionStatus = 'trial_active';
      sub.deletionScheduledAt = undefined;
      sub.trialConsumed = true;
      sub.isSimulatedDev = true;
      break;
    }
    case 'EXPIRE_TRIAL': {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // Expired yesterday (within 48h grace)
      const gracePeriodEnd = new Date(past.getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
      sub.status = 'expired';
      sub.trialEnd = past;
      sub.gracePeriodEnd = gracePeriodEnd;
      sub.retentionStatus = 'in_grace_period';
      sub.trialConsumed = true;
      sub.isSimulatedDev = true;
      break;
    }
    case 'SIMULATE_UPGRADE': {
      sub.status = 'active';
      sub.planId = 'nri-plus';
      sub.planName = AUTHORITATIVE_PLANS['nri-plus'].nameEn;
      sub.maxFamilyMembers = AUTHORITATIVE_PLANS['nri-plus'].maxFamilyMembers;
      sub.retentionStatus = 'retained_paid';
      sub.deletionScheduledAt = undefined;
      sub.isSimulatedDev = true;
      sub.currentPeriodStart = new Date();
      sub.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case 'CANCEL': {
      sub.status = 'canceled';
      sub.cancelledAt = new Date();
      sub.isSimulatedDev = true;
      break;
    }
    default:
      throw new Error(`Unknown simulation action: ${action}`);
  }

  await sub.save();
  return evaluateUserEntitlement(userId);
}

/**
 * Updates subscription status respecting the authoritative state machine.
 */
export async function updateSubscriptionStatus(
  userId: string,
  newStatus: SubscriptionStatus,
  options: { cancelAtPeriodEnd?: boolean; reason?: string } = {}
): Promise<ISubscription | any> {
  const sub = await getOrCreateUserSubscription(userId);
  const currentStatus = sub.status;

  if (!isValidSubscriptionTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid subscription transition from '${currentStatus}' to '${newStatus}'. Transition not permitted by state machine.`
    );
  }

  sub.status = newStatus;
  if (options.cancelAtPeriodEnd !== undefined) {
    sub.cancelAtPeriodEnd = options.cancelAtPeriodEnd;
  }
  if (newStatus === 'canceled' && !sub.cancelledAt) {
    sub.cancelledAt = new Date();
  }

  await sub.save();
  return sub;
}

export interface AdminCancelSubscriptionOptions {
  mode: 'END_OF_PERIOD' | 'IMMEDIATE';
  reason?: string;
}

export interface AdminActorContext {
  adminId: string;
  adminEmail: string;
  ipAddress?: string;
  userAgent?: string;
  targetUserEmail?: string;
}

/**
 * Super Admin & Admin: Cancels an active customer subscription.
 * Option A (END_OF_PERIOD): Retains paid benefits until currentPeriodEnd, marks cancelAtPeriodEnd=true, prevents auto-renewal.
 * Option B (IMMEDIATE): Revokes paid benefits immediately, records mandatory reason. Preserves all customer documents and family records.
 * Records immutable AdminAuditEvent and sends customer notification without blocking.
 */
export async function adminCancelSubscription(
  identifier: string,
  options: AdminCancelSubscriptionOptions,
  context: AdminActorContext
): Promise<{
  subscription: ISubscription | any;
  entitlement: EntitlementStatus;
  message: string;
}> {
  const isMockAllowed = isMockDbAllowed();
  const mode = options.mode || 'END_OF_PERIOD';

  if (mode !== 'END_OF_PERIOD' && mode !== 'IMMEDIATE') {
    throw new Error(`Invalid cancellation mode '${mode}'. Must be 'END_OF_PERIOD' or 'IMMEDIATE'.`);
  }

  const cleanReason = (options.reason || '').trim();
  if (mode === 'IMMEDIATE' && (!cleanReason || cleanReason.length < 5)) {
    throw new Error('A detailed cancellation reason (at least 5 characters) is required for immediate cancellation.');
  }

  let sub: any = null;

  if (mongoose.connection.readyState === 1) {
    if (Types.ObjectId.isValid(identifier)) {
      sub = await Subscription.findById(identifier);
      if (!sub) {
        sub = await Subscription.findOne({ userId: new Types.ObjectId(identifier) });
      }
    }
  } else if (isMockAllowed) {
    if (mockSubscriptions.has(identifier)) {
      sub = mockSubscriptions.get(identifier);
    } else {
      for (const s of mockSubscriptions.values()) {
        if (s._id === identifier || s.userId?.toString() === identifier) {
          sub = s;
          break;
        }
      }
    }
  }

  if (!sub) {
    throw new Error('Subscription record not found.');
  }

  if (sub.status === 'canceled') {
    throw new Error('This subscription has already been cancelled.');
  }

  if (mode === 'END_OF_PERIOD' && sub.cancelAtPeriodEnd) {
    throw new Error('This subscription is already scheduled to cancel at the end of the billing period.');
  }

  const previousStatus = sub.status;
  const now = new Date();

  if (mode === 'END_OF_PERIOD') {
    sub.cancelAtPeriodEnd = true;
    sub.cancellationMode = 'END_OF_PERIOD';
    sub.cancellationReason = cleanReason || 'Scheduled cancellation at billing period end';
    sub.cancelledAt = now;
    sub.cancellationRequestedAt = now;
    if (context.adminId && Types.ObjectId.isValid(context.adminId)) {
      sub.cancelledBy = new Types.ObjectId(context.adminId);
    }
    sub.cancelledByEmail = context.adminEmail;
    sub.previousStatus = previousStatus;
    // Status stays active until currentPeriodEnd so customer retains all paid benefits
  } else {
    sub.status = 'canceled';
    sub.cancelAtPeriodEnd = false;
    sub.cancellationMode = 'IMMEDIATE';
    sub.cancellationReason = cleanReason;
    sub.cancelledAt = now;
    sub.cancellationRequestedAt = now;
    if (context.adminId && Types.ObjectId.isValid(context.adminId)) {
      sub.cancelledBy = new Types.ObjectId(context.adminId);
    }
    sub.cancelledByEmail = context.adminEmail;
    sub.previousStatus = previousStatus;
    // Paid benefits revoked immediately. Existing documents and family members are preserved.
  }

  await sub.save();

  // Immutable Admin Audit Event
  try {
    if (mongoose.connection.readyState === 1) {
      await AdminAuditEvent.create({
        action: 'SUBSCRIPTION_CANCELLED',
        category: 'BILLING',
        severity: mode === 'IMMEDIATE' ? 'WARNING' : 'INFO',
        adminId: context.adminId,
        adminEmail: context.adminEmail,
        targetId: sub._id.toString(),
        targetType: 'Subscription',
        details: {
          userId: sub.userId.toString(),
          mode,
          reason: sub.cancellationReason,
          previousPlan: sub.planId,
          previousPlanName: sub.planName,
          previousStatus,
          effectiveCancellationDate: mode === 'IMMEDIATE' ? now : sub.currentPeriodEnd,
          currentPeriodEnd: sub.currentPeriodEnd,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        outcome: 'SUCCESS',
      });
    }
  } catch (err) {
    console.warn('[SubscriptionService] Failed to record admin audit event (non-blocking):', err);
  }

  // Non-blocking Customer Notification
  try {
    let recipientEmail = context.targetUserEmail;
    if (!recipientEmail && mongoose.connection.readyState === 1 && Types.ObjectId.isValid(sub.userId)) {
      const userDoc = await User.findById(sub.userId).select('email fullName').lean();
      recipientEmail = userDoc?.email;
    }
    if (recipientEmail) {
      const effectiveDateStr = mode === 'IMMEDIATE'
        ? 'immediately'
        : sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'at the end of your billing cycle';

      await sendEmail({
        to: recipientEmail,
        subject: mode === 'IMMEDIATE'
          ? 'Kudumba Vault: Paid Subscription Cancelled'
          : 'Kudumba Vault: Subscription Scheduled to End',
        text: mode === 'IMMEDIATE'
          ? `Your paid subscription for ${sub.planName} has been cancelled effective immediately. Your existing uploaded documents and family member records remain safe and accessible in read-only mode.\n\nReason: ${sub.cancellationReason || 'Administrative cancellation'}`
          : `Your subscription for ${sub.planName} is scheduled to end on ${effectiveDateStr}. Your benefits remain active until then. No further charges will occur.\n\nReason: ${sub.cancellationReason || 'Administrative cancellation'}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0B0B0C;">Kudumba Vault Subscription Notice</h2>
          <p style="color: #5B6168; font-size: 14px;">
            ${mode === 'IMMEDIATE'
              ? `Your paid subscription for <strong>${sub.planName}</strong> has been cancelled effective immediately.`
              : `Your subscription for <strong>${sub.planName}</strong> is scheduled to end on <strong>${effectiveDateStr}</strong>. Your benefits remain active until then.`
            }
          </p>
          ${cleanReason ? `<p style="color: #5B6168; font-size: 13px;"><strong>Reason:</strong> ${cleanReason}</p>` : ''}
          <p style="color: #7C879B; font-size: 12px; margin-top: 24px;">
            Your existing documents and family member records remain securely stored and accessible.
          </p>
        </div>`,
      });
    }
  } catch (notifErr) {
    console.warn('[SubscriptionService] Customer cancellation email notification failed (non-blocking):', notifErr);
  }

  const entitlement = await evaluateUserEntitlement(sub.userId.toString());

  const message = mode === 'IMMEDIATE'
    ? 'Subscription cancelled immediately. Paid benefits revoked.'
    : 'Subscription scheduled to cancel at billing period end. Paid benefits remain active until expiry.';

  return {
    subscription: sub,
    entitlement,
    message,
  };
}

export interface TrialBatchResult {
  evaluatedCount: number;
  expiredCount: number;
  remindersSent: number;
  expirationsNotified: number;
  alreadyExpiredCount: number;
  activeTrialsCount: number;
  details: Array<{
    userId: string;
    action: 'EXPIRED' | 'REMINDER_SENT' | 'EXPIRY_NOTIFIED' | 'SKIPPED_ACTIVE' | 'SKIPPED_ALREADY_EXPIRED';
    trialEnd?: string;
    hoursRemaining?: number;
  }>;
}

let isBatchRunning = false;

/**
 * Automated batch processor for expiring trials and sending milestone reminders.
 * Idempotent, safe across server restarts, operates in UTC, and never deletes user documents.
 */
export async function processExpiredTrialsBatch(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<TrialBatchResult> {
  if (isBatchRunning) {
    console.warn('[SubscriptionService] A trial expiration batch is already running. Skipping concurrent run.');
    return {
      evaluatedCount: 0,
      expiredCount: 0,
      remindersSent: 0,
      expirationsNotified: 0,
      alreadyExpiredCount: 0,
      activeTrialsCount: 0,
      details: [],
    };
  }

  isBatchRunning = true;
  try {
    const isDryRun = options?.dryRun === true;
    const now = options?.now || new Date();
    const nowMs = now.getTime();

    const result: TrialBatchResult = {
      evaluatedCount: 0,
      expiredCount: 0,
      remindersSent: 0,
      expirationsNotified: 0,
      alreadyExpiredCount: 0,
      activeTrialsCount: 0,
      details: [],
    };

    const isDb = mongoose.connection.readyState === 1;
    const isMockAllowed = isMockDbAllowed();

    // Helper to fetch user email and notification preferences
    const resolveUserAndPrefs = async (userId: string, existingEmail?: string) => {
      let email = existingEmail;
      let preferredLang: 'en' | 'ml' = 'en';
      let allowsExpiredNotifications = true;

      if (isDb && Types.ObjectId.isValid(userId)) {
        try {
          const userDoc = await User.findById(userId).select('email preferredLang').lean();
          if (userDoc?.email) email = userDoc.email;
          if (userDoc?.preferredLang) preferredLang = userDoc.preferredLang;
          const settingsDoc = await UserSettings.findOne({ userId }).select('notificationPreferences').lean();
          if (settingsDoc?.notificationPreferences?.reminderExpired === false) {
            allowsExpiredNotifications = false;
          }
        } catch (err) {
          console.warn('[SubscriptionService] Error resolving user preferences from MongoDB:', err);
        }
      } else if (isMockAllowed) {
        const mockUser = findMockUserById(userId);
        if (mockUser?.email) email = mockUser.email;
        if (mockUser?.preferredLang) preferredLang = mockUser.preferredLang;
        const mockSettings = getMockUserSettingsByUserId(userId);
        if (mockSettings?.notificationPreferences?.reminderExpired === false) {
          allowsExpiredNotifications = false;
        }
      }

      return { email, preferredLang, allowsExpiredNotifications };
    };

    // Subscriptions to inspect:
    let subsToProcess: any[] = [];

    if (isDb) {
      subsToProcess = await Subscription.find({
        $or: [
          { status: 'trialing' },
          { status: 'expired', 'metadata.trialExpiryNotifiedAt': { $exists: false } },
        ],
      });
    } else if (isMockAllowed) {
      subsToProcess = Array.from(mockSubscriptions.values());
    }

    for (const sub of subsToProcess) {
      // Strictly skip active paid subscriptions or subscriptions with billable plans
      if (sub.status === 'active' || (sub.planId && sub.planId !== 'founding-free' && sub.status !== 'trialing' && sub.status !== 'expired')) {
        continue;
      }

      result.evaluatedCount++;
      const userIdStr = sub.userId?.toString() || sub._id?.toString() || 'unknown';
      const trialEndTime = sub.trialEnd ? new Date(sub.trialEnd).getTime() : 0;
      const gracePeriodEndTime = sub.gracePeriodEnd
        ? new Date(sub.gracePeriodEnd).getTime()
        : trialEndTime + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000;

      // Ensure metadata container exists
      if (!sub.metadata) sub.metadata = {};

      // CASE 1: Trial has expired (nowMs >= trialEndTime) or already marked expired but not yet notified
      if (nowMs >= trialEndTime) {
        const wasTrialing = sub.status === 'trialing';

        if (wasTrialing) {
          result.expiredCount++;
          if (!isDryRun) {
            sub.status = 'expired';
            sub.planId = 'founding-free';
            sub.planName = AUTHORITATIVE_PLANS['founding-free'].nameEn;
            sub.maxFamilyMembers = AUTHORITATIVE_PLANS['founding-free'].maxFamilyMembers;
            sub.retentionStatus = 'in_grace_period';
            if (!sub.gracePeriodEnd) {
              sub.gracePeriodEnd = new Date(gracePeriodEndTime);
            }
          }
        } else {
          result.alreadyExpiredCount++;
        }

        // Notification: Trial Expiration
        if (!sub.metadata?.trialExpiryNotifiedAt) {
          const { email, preferredLang, allowsExpiredNotifications } = await resolveUserAndPrefs(userIdStr, sub.userEmail);

          if (email && allowsExpiredNotifications) {
            if (!isDryRun) {
              try {
                await sendEmail({
                  to: email,
                  subject: preferredLang === 'ml'
                    ? 'കുടുംബ വോൾട്ട്: നിങ്ങളുടെ സൗജന്യ ട്രയൽ കാലാവധി കഴിഞ്ഞു'
                    : 'Kudumba Vault: Your 3-Day Free Trial Has Ended',
                  text: preferredLang === 'ml'
                    ? `നിങ്ങളുടെ 3-ദിവസത്തെ സൗജന്യ ട്രയൽ കാലാവധി അവസാനിച്ചു. നിങ്ങളുടെ അക്കൗണ്ട് ഫൗണ്ടിംഗ് ഫ്രീ പ്ലാനിലേക്ക് മാറിയിരിക്കുന്നു. നിലവിലുള്ള രേഖകളും കുടുംബാംഗങ്ങളുടെ വിവരങ്ങളും സുരക്ഷിതമാണ്. കൂടുതൽ രേഖകൾ അപ്‌ലോഡ് ചെയ്യുന്നതിനായി എൻ.ആർ.ഐ പ്ലാനിലേക്ക് അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                    : `Your 3-day free trial has expired. Your account has automatically transitioned to the Founding Free plan (3 GB cloud storage, 3 documents limit, 5 household members).\n\nAll your existing documents and family member records remain 100% safe, readable, and downloadable. New uploads are paused.\n\nUpgrade anytime to NRI Family Plus for 15 GB storage and unlimited document uploads.`,
                  html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0B0B0C;">${preferredLang === 'ml' ? 'സൗജന്യ ട്രയൽ കാലാവധി കഴിഞ്ഞു' : 'Free Trial Ended'}</h2>
                    <p style="color: #5B6168; font-size: 14px;">
                      ${preferredLang === 'ml'
                        ? 'നിങ്ങളുടെ 3-ദിവസത്തെ സൗജന്യ ട്രയൽ കാലാവധി അവസാനിച്ചു. നിങ്ങളുടെ അക്കൗണ്ട് ഫൗണ്ടിംഗ് സൗജന്യ പ്ലാനിലേക്ക് മാറിയിരിക്കുന്നു.'
                        : 'Your 3-day free trial has expired. Your account has transitioned to the <strong>Founding Free plan</strong>.'}
                    </p>
                    <div style="background-color: #F8F9FA; border-left: 4px solid #6F4E37; padding: 12px; margin: 16px 0;">
                      <p style="margin: 0; color: #2B2F38; font-size: 13px;">
                        <strong>${preferredLang === 'ml' ? 'രേഖകൾ സുരക്ഷിതമാണ്:' : 'Your documents are safe:'}</strong>
                        ${preferredLang === 'ml'
                          ? 'നിങ്ങൾ മുൻപ് ചേർത്ത രേഖകളും വിവരങ്ങളും സുരക്ഷിതമായി ഡൗൺലോഡ് ചെയ്യാം.'
                          : 'All existing uploaded documents and family member records remain intact and accessible for viewing and download.'}
                      </p>
                    </div>
                    <p style="color: #7C879B; font-size: 12px; margin-top: 24px;">
                      Kudumba Vault — Kerala's Authoritative Family Vault.
                    </p>
                  </div>`,
                });
              } catch (mailErr) {
                console.warn('[SubscriptionService] Expiration email dispatch error (non-blocking):', mailErr);
              }

              sub.metadata = {
                ...sub.metadata,
                trialExpiryNotifiedAt: now.toISOString(),
              };
            }
            result.expirationsNotified++;
          }
        }

        if (!isDryRun && typeof sub.save === 'function') {
          await sub.save();
        }

        result.details.push({
          userId: userIdStr,
          action: wasTrialing ? 'EXPIRED' : 'EXPIRY_NOTIFIED',
          trialEnd: sub.trialEnd ? new Date(sub.trialEnd).toISOString() : undefined,
          hoursRemaining: 0,
        });
        continue;
      }

      // CASE 2: Trial is active (nowMs < trialEndTime)
      result.activeTrialsCount++;
      const msRemaining = trialEndTime - nowMs;
      const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));

      // Check if within 24-hour reminder window (<= 24h) and not yet reminded
      if (hoursRemaining <= 24 && !sub.metadata?.trial24hReminderSentAt) {
        const { email, preferredLang, allowsExpiredNotifications } = await resolveUserAndPrefs(userIdStr, sub.userEmail);

        if (email && allowsExpiredNotifications) {
          if (!isDryRun) {
            try {
              await sendEmail({
                to: email,
                subject: preferredLang === 'ml'
                  ? `കുടുംബ വോൾട്ട്: നിങ്ങളുടെ സൗജന്യ ട്രയൽ ${hoursRemaining} മണിക്കൂറിനുള്ളിൽ അവസാനിക്കും`
                  : `Kudumba Vault: Your Free Trial Ends in ${hoursRemaining} Hours`,
                text: preferredLang === 'ml'
                  ? `നിങ്ങളുടെ 3-ദിവസത്തെ സൗജന്യ ട്രയൽ ${hoursRemaining} മണിക്കൂറിനുള്ളിൽ അവസാനിക്കും. തടസ്സമില്ലാത്ത പൂർണ്ണ സൗകര്യങ്ങൾക്കായി ഇപ്പോൾ തന്നെ എൻ.ആർ.ഐ ഫാമിലി പ്ലാനിലേക്ക് അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                  : `Your 3-day free trial will end in approximately ${hoursRemaining} hours.\n\nAll your uploaded documents and family members will remain safe in read-only mode if you do not upgrade.\n\nTo keep full upload capabilities and access 15 GB storage, upgrade to NRI Family Plus anytime.`,
                html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #0B0B0C;">${preferredLang === 'ml' ? 'ട്രയൽ ഉടൻ അവസാനിക്കും' : 'Free Trial Ending Soon'}</h2>
                  <p style="color: #5B6168; font-size: 14px;">
                    ${preferredLang === 'ml'
                      ? `നിങ്ങളുടെ സൗജന്യ ട്രയൽ <strong>${hoursRemaining} മണിക്കൂറിനുള്ളിൽ</strong> അവസാനിക്കും.`
                      : `Your 3-day free trial will end in <strong>${hoursRemaining} hours</strong>.`}
                  </p>
                  <p style="color: #7C879B; font-size: 12px; margin-top: 24px;">
                    Your existing documents will never be deleted upon trial completion.
                  </p>
                </div>`,
              });
            } catch (reminderErr) {
              console.warn('[SubscriptionService] 24h reminder email dispatch error (non-blocking):', reminderErr);
            }

            sub.metadata = {
              ...sub.metadata,
              trial24hReminderSentAt: now.toISOString(),
            };

            if (typeof sub.save === 'function') {
              await sub.save();
            }
          }
          result.remindersSent++;
        }

        result.details.push({
          userId: userIdStr,
          action: 'REMINDER_SENT',
          trialEnd: sub.trialEnd ? new Date(sub.trialEnd).toISOString() : undefined,
          hoursRemaining,
        });
      } else {
        result.details.push({
          userId: userIdStr,
          action: 'SKIPPED_ACTIVE',
          trialEnd: sub.trialEnd ? new Date(sub.trialEnd).toISOString() : undefined,
          hoursRemaining,
        });
      }
    }

    return result;
  } finally {
    isBatchRunning = false;
  }
}

// Reset mock store helper for tests
export function _resetMockSubscriptions() {
  mockSubscriptions.clear();
  mockTrialConsumptions.clear();
  activeReservations.clear();
}

export function _getMockSubscription(userId: string) {
  return mockSubscriptions.get(userId);
}
