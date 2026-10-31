import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { timingSafeCompare } from '../utils/securityUtils';
import { ProcessedWebhookEvent, getMockProcessedWebhooks } from '../models/ProcessedWebhookEvent';
import { Subscription } from '../models/Subscription';
import { Transaction } from '../models/Transaction';
import { PaymentHistory, getMockPaymentHistories } from '../models/PaymentHistory';
import { calculatePlanPricing } from './paymentService';
import { getOrCreateUserSubscription } from './subscriptionService';
import { getPlanConfig } from '../config/planConfig';
import { isMockDbAllowed } from '../models/User';
import { AdminAuditEvent } from '../models/AdminAuditEvent';

/**
 * Retrieves the authoritative Razorpay Key Secret.
 */
export function getRazorpayKeySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Razorpay] Production startup error: RAZORPAY_KEY_SECRET must be configured.');
    }
    return 'kudumba_test_razorpay_secret_key_12345';
  }
  return secret;
}

/**
 * Retrieves the authoritative Razorpay Webhook Secret.
 */
export function getRazorpayWebhookSecret(): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Razorpay] Production startup error: RAZORPAY_WEBHOOK_SECRET must be configured.');
    }
    return 'kudumba_test_razorpay_webhook_secret_67890';
  }
  return secret;
}

/**
 * Verifies Razorpay payment signatures server-side using HMAC-SHA256 and timing-safe equality.
 * Supports both standard Order payments and Subscription payments.
 */
export function verifyRazorpayPaymentSignature(
  params: {
    orderId?: string;
    subscriptionId?: string;
    paymentId: string;
    signature: string;
  },
  secretOverride?: string
): { valid: boolean; error?: string } {
  const { orderId, subscriptionId, paymentId, signature } = params;

  if (!paymentId || typeof paymentId !== 'string') {
    return { valid: false, error: 'paymentId is required.' };
  }
  if (!signature || typeof signature !== 'string') {
    return { valid: false, error: 'payment signature is required.' };
  }
  if (!orderId && !subscriptionId) {
    return { valid: false, error: 'Either orderId or subscriptionId is required for signature verification.' };
  }

  const secret = secretOverride || getRazorpayKeySecret();

  let expectedSignature = '';
  if (orderId) {
    const payload = `${orderId}|${paymentId}`;
    expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  } else if (subscriptionId) {
    const payload = `${paymentId}|${subscriptionId}`;
    expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  const valid = timingSafeCompare(expectedSignature, signature);
  if (!valid) {
    return { valid: false, error: 'Invalid payment signature. Verification failed.' };
  }

  return { valid: true };
}

/**
 * Validates Razorpay webhook signatures against the RAW request body buffer.
 * NEVER validates against a JSON-serialized representation.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secretOverride?: string
): { valid: boolean; error?: string } {
  if (!rawBody) {
    return { valid: false, error: 'Raw request body is missing for webhook signature verification.' };
  }
  if (!signature || typeof signature !== 'string') {
    return { valid: false, error: 'Webhook signature header (x-razorpay-signature) is required.' };
  }

  const secret = secretOverride || getRazorpayWebhookSecret();
  const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  const expectedSignature = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
  const valid = timingSafeCompare(expectedSignature, signature);

  if (!valid) {
    return { valid: false, error: 'Invalid webhook signature.' };
  }

  return { valid: true };
}

/**
 * Checks if a webhook event ID has already been processed (Idempotency).
 */
export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  if (!eventId) return false;

  if (mongoose.connection.readyState === 1) {
    const existing = await ProcessedWebhookEvent.findOne({ eventId });
    return Boolean(existing);
  }

  if (isMockDbAllowed()) {
    const mockStore = getMockProcessedWebhooks();
    return mockStore.has(eventId);
  }

  return false;
}

/**
 * Marks a webhook event as processed idempotently.
 */
export async function markWebhookEventProcessed(
  eventId: string,
  details: {
    gateway: 'RAZORPAY';
    eventType: string;
    paymentId?: string;
    status: 'PROCESSED' | 'FAILED';
    metadata?: any;
  }
): Promise<void> {
  if (!eventId) return;

  if (mongoose.connection.readyState === 1) {
    await ProcessedWebhookEvent.findOneAndUpdate(
      { eventId },
      {
        $setOnInsert: {
          eventId,
          gateway: details.gateway,
          eventType: details.eventType,
          paymentId: details.paymentId,
          status: details.status,
          processedAt: new Date(),
          metadata: details.metadata,
        },
      },
      { upsert: true }
    );
    return;
  }

  if (isMockDbAllowed()) {
    const mockStore = getMockProcessedWebhooks();
    mockStore.set(eventId, {
      eventId,
      ...details,
      processedAt: new Date(),
    });
  }
}

/**
 * Verifies a Razorpay payment and confirms payment status server-side before activating paid entitlement.
 * Enforces replay protection and creates financial transaction and audit logs.
 */
export async function verifyAndActivateRazorpayPayment(
  userId: string,
  params: {
    paymentId: string;
    orderId?: string;
    subscriptionId?: string;
    signature: string;
    planId: string;
    duration?: 'monthly' | 'quarterly' | 'yearly';
    couponCode?: string;
  }
): Promise<{ ok: boolean; subscription: any; transaction: any }> {
  // 1. Verify cryptographic signature
  const sigResult = verifyRazorpayPaymentSignature({
    orderId: params.orderId,
    subscriptionId: params.subscriptionId,
    paymentId: params.paymentId,
    signature: params.signature,
  });

  if (!sigResult.valid) {
    throw new Error(sigResult.error || 'Payment signature verification failed.');
  }

  // 2. Prevent replay attacks: check if payment ID has already been claimed
  if (mongoose.connection.readyState === 1) {
    const existingTx = await Transaction.findOne({ gatewayPaymentId: params.paymentId });
    if (existingTx && existingTx.status === 'SUCCESS') {
      throw new Error('This payment has already been processed and credited.');
    }
  } else if (isMockDbAllowed()) {
    const mockHist = getMockPaymentHistories();
    for (const h of mockHist.values()) {
      if (h.utrNumber === params.paymentId) {
        throw new Error('This payment has already been processed and credited.');
      }
    }
  }

  // 3. Authoritatively compute plan pricing on the server
  const pricing = calculatePlanPricing(params.planId, params.duration || 'monthly', params.couponCode);

  // 4. Activate user's subscription in MongoDB / mock store
  const sub = await getOrCreateUserSubscription(userId);
  const targetPlan = getPlanConfig(pricing.planId);
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + pricing.durationMonths * 30 * 24 * 60 * 60 * 1000);

  sub.status = 'active';
  sub.planId = targetPlan.id;
  sub.planName = targetPlan.nameEn;
  sub.maxFamilyMembers = targetPlan.maxFamilyMembers;
  sub.priceInr = pricing.finalPayable;
  sub.cadence = pricing.durationMonths === 12 ? 'ANNUAL' : 'MONTHLY';
  sub.currentPeriodStart = periodStart;
  sub.currentPeriodEnd = periodEnd;
  sub.retentionStatus = 'retained_paid';
  sub.deletionScheduledAt = undefined;
  sub.lastPaymentId = params.paymentId;
  if (params.subscriptionId) {
    sub.razorpaySubscriptionId = params.subscriptionId;
  }
  sub.isSimulatedDev = false;
  await sub.save();

  // 5. Create authoritative financial Transaction record
  let transaction: any = null;
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    transaction = await Transaction.create({
      transactionReference: `RZP-${params.paymentId}`,
      userId: new Types.ObjectId(userId),
      subscriptionId: sub._id,
      amountInr: pricing.finalPayable,
      gatewayFeeInr: Math.round(pricing.finalPayable * 0.02), // Standard ~2% gateway fee
      taxInr: Math.round(pricing.finalPayable * 0.02 * 0.18), // 18% GST on fee
      netAmountInr: pricing.finalPayable - Math.round(pricing.finalPayable * 0.02 * 1.18),
      currency: pricing.currency,
      status: 'SUCCESS',
      paymentGateway: 'RAZORPAY',
      gatewayPaymentId: params.paymentId,
      gatewayOrderId: params.orderId,
      reconciled: true,
      reconciledAt: new Date(),
      metadata: {
        planId: pricing.planId,
        billingDuration: pricing.duration,
        durationMonths: pricing.durationMonths,
      },
    });

    // Create PaymentHistory record
    await PaymentHistory.create({
      userId: new Types.ObjectId(userId),
      amount: pricing.finalPayable,
      currency: pricing.currency,
      utrNumber: params.paymentId,
      planId: pricing.planId,
      planNameSnapshot: pricing.planName,
      billingDuration: pricing.duration,
      durationMonths: pricing.durationMonths,
      paymentDate: new Date(),
      verificationStatus: 'APPROVED',
      approvedByEmail: 'razorpay-server-verification',
      approvedAt: new Date(),
    });
  } else if (isMockDbAllowed()) {
    const mockHistStore = getMockPaymentHistories();
    const historyId = new mongoose.Types.ObjectId();
    mockHistStore.set(historyId.toString(), {
      _id: historyId,
      userId: new mongoose.Types.ObjectId(userId),
      amount: pricing.finalPayable,
      currency: pricing.currency,
      utrNumber: params.paymentId,
      planId: pricing.planId,
      planNameSnapshot: pricing.planName,
      billingDuration: pricing.duration,
      durationMonths: pricing.durationMonths,
      paymentDate: new Date(),
      verificationStatus: 'APPROVED',
      approvedByEmail: 'razorpay-server-verification',
      approvedAt: new Date(),
    });

    transaction = {
      transactionReference: `RZP-${params.paymentId}`,
      userId,
      amountInr: pricing.finalPayable,
      status: 'SUCCESS',
      paymentGateway: 'RAZORPAY',
      gatewayPaymentId: params.paymentId,
      reconciled: true,
    };
  }

  // 6. Record Admin Audit Event
  try {
    if (mongoose.connection.readyState === 1) {
      await AdminAuditEvent.create({
        action: 'RAZORPAY_PAYMENT_VERIFIED',
        category: 'BILLING',
        severity: 'INFO',
        adminId: userId,
        adminEmail: 'client-checkout',
        targetId: params.paymentId,
        targetType: 'Transaction',
        details: {
          paymentId: params.paymentId,
          orderId: params.orderId,
          planId: pricing.planId,
          payableAmount: pricing.finalPayable,
        },
        outcome: 'SUCCESS',
      });
    }
  } catch {}

  return { ok: true, subscription: sub, transaction };
}

/**
 * Processes incoming Razorpay Webhook events idempotently.
 * Validates the raw request body buffer against x-razorpay-signature before processing.
 */
export async function processRazorpayWebhook(
  rawBody: Buffer | string,
  signature: string
): Promise<{ ok: boolean; duplicate?: boolean; message?: string }> {
  // 1. Verify webhook signature against raw request body buffer
  const sigVerification = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!sigVerification.valid) {
    throw new Error(sigVerification.error || 'Invalid webhook signature');
  }

  // 2. Parse verified JSON payload
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  let event: any;
  try {
    event = JSON.parse(bodyStr);
  } catch {
    throw new Error('Malformed webhook payload: JSON parsing failed.');
  }

  const eventId = event.id || event.payload?.payment?.entity?.id;
  if (!eventId) {
    throw new Error('Webhook payload missing event identifier.');
  }

  // 3. Idempotency Check: reject duplicate processing
  const alreadyProcessed = await isWebhookEventProcessed(eventId);
  if (alreadyProcessed) {
    return { ok: true, duplicate: true, message: 'Event already processed.' };
  }

  const eventType = event.event;
  const paymentEntity = event.payload?.payment?.entity;

  // 4. Handle events
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    if (paymentEntity && paymentEntity.status === 'captured') {
      const paymentId = paymentEntity.id;
      const notes = paymentEntity.notes || {};
      const targetUserId = notes.userId || notes.user_id;
      const planId = notes.planId || 'nri-plus';
      const duration = (notes.duration as any) || 'monthly';

      if (targetUserId) {
        await verifyAndActivateRazorpayPayment(targetUserId, {
          paymentId,
          orderId: paymentEntity.order_id,
          signature, // webhook authenticated
          planId,
          duration,
        }).catch((err) => {
          // If already credited via client verify, treat idempotently
          console.warn('[RazorpayWebhook] Notice processing payment activation:', err.message);
        });
      }
    }
  }

  // 5. Record event idempotently
  await markWebhookEventProcessed(eventId, {
    gateway: 'RAZORPAY',
    eventType,
    paymentId: paymentEntity?.id,
    status: 'PROCESSED',
    metadata: {
      event: eventType,
      amount: paymentEntity?.amount ? paymentEntity.amount / 100 : undefined,
    },
  });

  return { ok: true, message: 'Webhook event processed successfully.' };
}
