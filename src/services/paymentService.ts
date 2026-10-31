import mongoose, { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';
import {
  PaymentRequest,
  IPaymentRequest,
  PaymentRequestStatus,
  BillingDuration,
  IBillingAddressSnapshot,
  getMockPaymentRequests,
} from '../models/PaymentRequest';
import {
  PaymentHistory,
  IPaymentHistory,
  getMockPaymentHistories,
} from '../models/PaymentHistory';
import { UpiConfig, IUpiConfig, getMockUpiConfig, setMockUpiConfig } from '../models/UpiConfig';
import { User, isMockDbAllowed } from '../models/User';
import { UserSettings } from '../models/UserSettings';
import { Subscription } from '../models/Subscription';
import { Transaction } from '../models/Transaction';
import { AdminAuditEvent } from '../models/AdminAuditEvent';
import { AUTHORITATIVE_PLANS, getPlanConfig } from '../config/planConfig';
import { getOrCreateUserSubscription, evaluateUserEntitlement } from './subscriptionService';
import { buildUpiPaymentUri, generateQrSvg, generateQrDataUrl } from '../utils/qrCodeGenerator';
import { verifyFileSignature } from './supabaseStorage';

// Secure private storage directory for manual payment proof uploads
export const PAYMENT_PROOFS_DIR = path.resolve(process.cwd(), 'uploads', 'payment-proofs');

// Ensure proof directory exists
if (!fs.existsSync(PAYMENT_PROOFS_DIR)) {
  try {
    fs.mkdirSync(PAYMENT_PROOFS_DIR, { recursive: true });
  } catch (err) {
    console.warn('[PaymentService] Notice: Could not create payment proofs dir at startup:', err);
  }
}

export interface PriceCalculationResult {
  planId: string;
  planName: string;
  monthlyRate: number;
  duration: BillingDuration;
  durationMonths: number;
  baseTotal: number;
  planSavings: number;
  subtotalPayable: number;
  couponCode?: string;
  couponDiscount: number;
  finalPayable: number;
  currency: string;
  featuresEn: string[];
  featuresMl: string[];
}

/**
 * Validates and calculates plan pricing on the server.
 * Never trusts client-submitted prices.
 */
export function calculatePlanPricing(
  planId: string,
  duration: BillingDuration = 'monthly',
  couponCode?: string
): PriceCalculationResult {
  const plan = getPlanConfig(planId);
  if (!plan.isBillable) {
    throw new Error(`Plan '${plan.nameEn}' cannot be billed via manual payment.`);
  }

  const monthlyRate = plan.priceInr;
  let durationMonths = 1;
  let planSavings = 0;

  switch (duration) {
    case 'monthly':
      durationMonths = 1;
      planSavings = 0;
      break;
    case 'quarterly':
      durationMonths = 3;
      // 3 months discount: ~13% for NRI Plus, ~10% for Partner Pro
      planSavings = planId === 'nri-plus' ? 98 : 298;
      break;
    case 'yearly':
      durationMonths = 12;
      // 12 months discount: 20% off
      planSavings = Math.round(monthlyRate * 12 * 0.2);
      break;
    default:
      durationMonths = 1;
      planSavings = 0;
  }

  const baseTotal = monthlyRate * durationMonths;
  const subtotalPayable = Math.max(0, baseTotal - planSavings);

  let couponDiscount = 0;
  let normalizedCoupon: string | undefined = undefined;

  if (couponCode && couponCode.trim()) {
    normalizedCoupon = couponCode.trim().toUpperCase();
    if (normalizedCoupon === 'KUDUMBA10') {
      couponDiscount = Math.round(subtotalPayable * 0.1);
    } else if (normalizedCoupon === 'WELCOME20') {
      couponDiscount = Math.round(subtotalPayable * 0.2);
    } else if (normalizedCoupon === 'VAULT50') {
      couponDiscount = Math.min(50, subtotalPayable);
    } else if (normalizedCoupon === 'FESTIE33') {
      couponDiscount = Math.round(subtotalPayable * 0.33);
    } else {
      throw new Error(`Invalid or expired coupon code '${couponCode.trim()}'.`);
    }
  }

  const finalPayable = Math.max(0, subtotalPayable - couponDiscount);

  return {
    planId: plan.id,
    planName: plan.nameEn,
    monthlyRate,
    duration,
    durationMonths,
    baseTotal,
    planSavings,
    subtotalPayable,
    couponCode: normalizedCoupon,
    couponDiscount,
    finalPayable,
    currency: 'INR',
    featuresEn: plan.featuresEn,
    featuresMl: plan.featuresMl,
  };
}

/**
 * Retrieves the active UPI receiver settings for manual payment.
 */
export async function getUpiPaymentConfig(): Promise<IUpiConfig | any> {
  if (mongoose.connection.readyState !== 1 && isMockDbAllowed()) {
    return getMockUpiConfig();
  }

  let config = await UpiConfig.findOne({ key: 'global_upi' });
  if (!config) {
    config = await UpiConfig.create({
      key: 'global_upi',
      upiId: process.env.ADMIN_UPI_ID || 'kudumbavault@oksbi',
      merchantName: process.env.ADMIN_UPI_MERCHANT_NAME || 'Kudumba Vault',
      whatsappNumber: process.env.ADMIN_WHATSAPP_NUMBER || process.env.VITE_WHATSAPP_SUPPORT_NUMBER || '+91 94470 00000',
      supportEmail: 'support@kudumbavault.com',
      isEnabled: true,
    });
  }
  return config;
}

/**
 * Updates UPI configuration settings.
 */
export async function updateUpiPaymentConfig(
  updates: Partial<IUpiConfig>,
  adminEmail: string = 'admin'
): Promise<IUpiConfig | any> {
  if (updates.upiId && (!updates.upiId.includes('@') || updates.upiId.trim().length < 5)) {
    throw new Error('Invalid UPI ID format (must contain @ and be at least 5 characters).');
  }

  if (mongoose.connection.readyState !== 1 && isMockDbAllowed()) {
    const mock = getMockUpiConfig();
    const updated = {
      ...mock,
      ...updates,
      updatedBy: adminEmail,
      updatedAt: new Date(),
    };
    setMockUpiConfig(updated);
    return updated;
  }

  const updated = await UpiConfig.findOneAndUpdate(
    { key: 'global_upi' },
    {
      $set: {
        ...updates,
        updatedBy: adminEmail,
      },
    },
    { new: true, upsert: true }
  );
  return updated;
}

/**
 * Creates a new manual payment request in PENDING state.
 * Rejects if user already has an active pending request.
 */
export async function createPaymentRequest(
  userId: string,
  data: {
    planId: string;
    duration: BillingDuration;
    billingAddress: IBillingAddressSnapshot;
    couponCode?: string;
    saveBillingAddress?: boolean;
  }
): Promise<IPaymentRequest | any> {
  const isMockAllowed = isMockDbAllowed();
  if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
    throw new Error('Database service is currently unavailable.');
  }

  // 1. Calculate authoritative pricing
  const pricing = calculatePlanPricing(data.planId, data.duration, data.couponCode);

  // 2. Validate billing address
  const addr = data.billingAddress;
  if (!addr || typeof addr !== 'object') {
    throw new Error('Billing address details are required.');
  }
  if (!addr.fullName || addr.fullName.trim().length < 2) {
    throw new Error('Full name in billing address must be at least 2 characters.');
  }
  if (!addr.houseBuilding || addr.houseBuilding.trim().length < 2) {
    throw new Error('House / building name is required.');
  }
  if (!addr.streetLocality || addr.streetLocality.trim().length < 2) {
    throw new Error('Street / locality is required.');
  }
  if (!addr.city || addr.city.trim().length < 2) {
    throw new Error('City is required.');
  }
  if (!addr.state || addr.state.trim().length < 2) {
    throw new Error('State is required.');
  }
  if (!addr.postalCode || addr.postalCode.trim().length < 4) {
    throw new Error('Postal PIN code is required.');
  }
  if (!addr.phone || addr.phone.trim().length < 8) {
    throw new Error('Valid contact phone number is required.');
  }

  const cleanAddress: IBillingAddressSnapshot = {
    fullName: addr.fullName.trim(),
    houseBuilding: addr.houseBuilding.trim(),
    streetLocality: addr.streetLocality.trim(),
    city: addr.city.trim(),
    state: addr.state.trim(),
    country: addr.country ? addr.country.trim() : 'India',
    postalCode: addr.postalCode.trim(),
    phone: addr.phone.trim(),
  };

  // 3. Save billing address to UserSettings if requested
  if (data.saveBillingAddress) {
    if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
      await UserSettings.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $set: { billingAddress: cleanAddress } },
        { upsert: true }
      );
    }
  }

  // 4. Duplicate pending check
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    const existingPending = await PaymentRequest.findOne({
      userId: new Types.ObjectId(userId),
      status: 'PENDING',
    });
    if (existingPending) {
      throw new Error(
        'A subscription change is already pending. Cancel or complete it before submitting a new request.'
      );
    }

    const doc = await PaymentRequest.create({
      userId: new Types.ObjectId(userId),
      subscriptionPlanId: pricing.planId,
      planNameSnapshot: pricing.planName,
      billingDuration: pricing.duration,
      durationMonths: pricing.durationMonths,
      monthlyRate: pricing.monthlyRate,
      baseTotal: pricing.baseTotal,
      planSavings: pricing.planSavings,
      couponCode: pricing.couponCode,
      couponDiscount: pricing.couponDiscount,
      payableAmount: pricing.finalPayable,
      currency: pricing.currency,
      billingAddressSnapshot: cleanAddress,
      status: 'PENDING',
    });

    return doc;
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    for (const req of mockStore.values()) {
      if (req.userId.toString() === userId && req.status === 'PENDING') {
        throw new Error(
          'A subscription change is already pending. Cancel or complete it before submitting a new request.'
        );
      }
    }

    const mockId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: mockId,
      id: mockId.toString(),
      userId: new mongoose.Types.ObjectId(userId),
      subscriptionPlanId: pricing.planId,
      planNameSnapshot: pricing.planName,
      billingDuration: pricing.duration,
      durationMonths: pricing.durationMonths,
      monthlyRate: pricing.monthlyRate,
      baseTotal: pricing.baseTotal,
      planSavings: pricing.planSavings,
      couponCode: pricing.couponCode,
      couponDiscount: pricing.couponDiscount,
      payableAmount: pricing.finalPayable,
      currency: pricing.currency,
      billingAddressSnapshot: cleanAddress,
      status: 'PENDING' as PaymentRequestStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      save: async function () {
        mockStore.set(this.id, this);
        return this;
      },
    };
    mockStore.set(mockDoc.id, mockDoc);
    return mockDoc;
  }

  throw new Error('Database service is currently unavailable.');
}

/**
 * Submits payment proof (UTR reference and screenshot) for a pending payment request.
 */
export async function submitPaymentProof(
  userId: string,
  params: {
    requestId: string;
    utrNumber: string;
    paymentDate: string | Date;
    remarks?: string;
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      path?: string;
    };
  }
): Promise<IPaymentRequest | any> {
  const isMockAllowed = isMockDbAllowed();

  // Validate requestId format strictly to prevent path traversal
  if (
    !params.requestId ||
    typeof params.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(params.requestId) ||
    params.requestId.includes('..') ||
    params.requestId.includes('/') ||
    params.requestId.includes('\\')
  ) {
    throw new Error('Invalid payment requestId format.');
  }

  const cleanUtr = params.utrNumber ? params.utrNumber.trim().toUpperCase() : '';

  // 1. Validate UTR format
  if (!cleanUtr) {
    throw new Error('UTR / Transaction reference number is required.');
  }
  if (!/^[A-Z0-9]{8,32}$/.test(cleanUtr)) {
    throw new Error(
      'Invalid UTR format. UTR / UPI transaction reference must be 8 to 32 alphanumeric characters.'
    );
  }

  // 2. Validate Payment Date
  const parsedDate = new Date(params.paymentDate);
  if (isNaN(parsedDate.getTime())) {
    throw new Error('Invalid payment date and time provided.');
  }
  if (parsedDate.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new Error('Payment date cannot be in the future.');
  }

  // 3. Validate Proof File
  if (!params.file && !isMockAllowed) {
    throw new Error('Payment screenshot is required.');
  }

  let proofPath = params.file?.path || '';
  const rawBase = path.basename(params.file?.originalname || 'payment_proof.png');
  const originalName = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const mimeType = params.file?.mimetype || 'image/png';
  const fileSize = params.file?.size || (params.file?.buffer ? params.file.buffer.length : 1024);

  if (params.file && fileSize <= 0) {
    throw new Error('Payment screenshot file is empty (0 bytes).');
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (params.file && !allowedMimes.includes(mimeType)) {
    throw new Error('Allowed proof formats are JPEG, PNG, or WebP images only.');
  }
  if (params.file && fileSize > 5 * 1024 * 1024) {
    throw new Error('Payment screenshot cannot exceed 5 MB.');
  }

  // Validate binary magic-bytes signature if buffer is provided
  if (params.file?.buffer) {
    const sig = verifyFileSignature(params.file.buffer);
    if (
      !sig.valid ||
      !sig.detectedMime ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(sig.detectedMime)
    ) {
      throw new Error(
        'Disallowed or forged file signature. Payment proof must be a genuine PNG, JPEG, or WebP image.'
      );
    }
  }

  // Save file to private upload dir if buffer provided
  if (params.file?.buffer) {
    const ext = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png';
    const safeReqId = params.requestId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `proof_${safeReqId}_${Date.now()}${ext}`;
    const fullPath = path.join(PAYMENT_PROOFS_DIR, filename);
    if (!path.normalize(fullPath).startsWith(PAYMENT_PROOFS_DIR)) {
      throw new Error('Access denied: Invalid file path.');
    }
    fs.writeFileSync(fullPath, params.file.buffer);
    proofPath = fullPath;
  }

  // 4. Resolve and update request in DB / Mock store
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(params.requestId)) {
    // Check for duplicate UTR in approved or other pending requests
    const duplicateUtr = await PaymentRequest.findOne({
      utrNumber: cleanUtr,
      _id: { $ne: new Types.ObjectId(params.requestId) },
      status: { $in: ['PENDING', 'APPROVED'] },
    });
    if (duplicateUtr) {
      throw new Error('This UTR / transaction reference number has already been submitted.');
    }

    const existingAnywhere = await PaymentRequest.findById(params.requestId);
    if (!existingAnywhere) {
      const err = new Error('Payment request not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (existingAnywhere.userId.toString() !== userId.toString()) {
      const err = new Error('Access denied: Payment request does not belong to the current user.');
      (err as any).statusCode = 403;
      throw err;
    }

    const request = await PaymentRequest.findOne({
      _id: new Types.ObjectId(params.requestId),
      userId: new Types.ObjectId(userId),
    });

    if (!request) {
      const err = new Error('Payment request not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (request.status !== 'PENDING') {
      throw new Error(`Cannot submit proof. Payment request is already ${request.status.toLowerCase()}.`);
    }

    request.utrNumber = cleanUtr;
    request.paymentDate = parsedDate;
    request.proofFilePath = proofPath || request.proofFilePath || 'uploads/payment-proofs/mock.png';
    request.proofOriginalName = originalName;
    request.proofMimeType = mimeType;
    request.proofFileSize = fileSize;
    if (params.remarks) {
      request.remarks = params.remarks.trim().slice(0, 500);
    }

    await request.save();
    return request;
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    for (const [id, req] of mockStore.entries()) {
      if (req.utrNumber === cleanUtr && id !== params.requestId && (req.status === 'PENDING' || req.status === 'APPROVED')) {
        throw new Error('This UTR / transaction reference number has already been submitted.');
      }
    }

    const req = mockStore.get(params.requestId);
    if (!req) {
      const err = new Error('Payment request not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (req.userId.toString() !== userId) {
      const err = new Error('Access denied: Payment request does not belong to the current user.');
      (err as any).statusCode = 403;
      throw err;
    }
    if (req.status !== 'PENDING') {
      throw new Error(`Cannot submit proof. Payment request is already ${req.status.toLowerCase()}.`);
    }

    req.utrNumber = cleanUtr;
    req.paymentDate = parsedDate;
    req.proofFilePath = proofPath || 'uploads/payment-proofs/mock.png';
    req.proofOriginalName = originalName;
    req.proofMimeType = mimeType;
    req.proofFileSize = fileSize;
    if (params.remarks) {
      req.remarks = params.remarks.trim().slice(0, 500);
    }
    req.updatedAt = new Date();
    mockStore.set(params.requestId, req);
    return req;
  }

  throw new Error('Database service is currently unavailable.');
}

/**
 * Cancels a pending payment request initiated by the user.
 */
export async function cancelPaymentRequest(userId: string, requestId: string): Promise<boolean> {
  const isMockAllowed = isMockDbAllowed();

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(requestId)) {
    const existingAnywhere = await PaymentRequest.findById(requestId);
    if (!existingAnywhere) {
      const err = new Error('Payment request not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (existingAnywhere.userId.toString() !== userId.toString()) {
      const err = new Error('Access denied: Payment request does not belong to the current user.');
      (err as any).statusCode = 403;
      throw err;
    }

    const request = await PaymentRequest.findOne({
      _id: new Types.ObjectId(requestId),
      userId: new Types.ObjectId(userId),
    });
    if (!request) {
      const err = new Error('Payment request not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (request.status !== 'PENDING') {
      throw new Error(`Cannot cancel payment request that is already ${request.status.toLowerCase()}.`);
    }
    request.status = 'CANCELLED';
    await request.save();
    return true;
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    const req = mockStore.get(requestId);
    if (!req) {
      const err = new Error('Payment request not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (req.userId.toString() !== userId) {
      const err = new Error('Access denied: Payment request does not belong to the current user.');
      (err as any).statusCode = 403;
      throw err;
    }
    if (req.status !== 'PENDING') {
      throw new Error(`Cannot cancel payment request that is already ${req.status.toLowerCase()}.`);
    }
    req.status = 'CANCELLED';
    mockStore.set(requestId, req);
    return true;
  }

  throw new Error('Database service is currently unavailable.');
}

/**
 * Gets the user's active pending payment request and saved billing details.
 */
export async function getUserCurrentPaymentStatus(userId: string): Promise<{
  activeRequest: IPaymentRequest | null;
  savedBillingAddress: IBillingAddressSnapshot | null;
  upiConfig: any;
}> {
  const isMockAllowed = isMockDbAllowed();
  const upiConfig = await getUpiPaymentConfig();
  let savedBillingAddress: IBillingAddressSnapshot | null = null;
  let activeRequest: any = null;

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    const userSettings = await UserSettings.findOne({ userId: new Types.ObjectId(userId) });
    if (userSettings?.billingAddress) {
      savedBillingAddress = userSettings.billingAddress as IBillingAddressSnapshot;
    }

    activeRequest = await PaymentRequest.findOne({
      userId: new Types.ObjectId(userId),
      status: 'PENDING',
    }).sort({ createdAt: -1 });

    if (!activeRequest) {
      // Find latest rejected request if any to inform the user
      activeRequest = await PaymentRequest.findOne({
        userId: new Types.ObjectId(userId),
      }).sort({ createdAt: -1 });
    }
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    for (const req of Array.from(mockStore.values()).reverse()) {
      if (req.userId.toString() === userId) {
        activeRequest = req;
        if (req.status === 'PENDING') break;
      }
    }
  }

  return {
    activeRequest,
    savedBillingAddress,
    upiConfig,
  };
}

/**
 * Admin: List payment requests grouped by status.
 */
export async function getAdminPaymentRequests(status?: PaymentRequestStatus): Promise<any[]> {
  const isMockAllowed = isMockDbAllowed();

  if (mongoose.connection.readyState === 1) {
    const filter: Record<string, any> = {};
    if (status) {
      filter.status = status;
    }
    const requests = await PaymentRequest.find(filter)
      .populate('userId', 'fullName name email familyName role')
      .sort({ createdAt: -1 })
      .lean();

    const userIds = requests.map((r: any) => r.userId?._id || r.userId).filter(Boolean);
    const subscriptions = await Subscription.find({ userId: { $in: userIds } }).lean();
    const subByUserId = new Map(subscriptions.map((s: any) => [s.userId.toString(), s]));

    return requests.map((req: any) => {
      const uId = (req.userId?._id || req.userId)?.toString();
      const sub = uId ? subByUserId.get(uId) : null;
      return {
        ...req,
        subscription: sub
          ? {
              _id: sub._id.toString(),
              status: sub.status,
              planId: sub.planId,
              planName: sub.planName,
              cadence: sub.cadence,
              priceInr: sub.priceInr,
              currentPeriodStart: sub.currentPeriodStart,
              currentPeriodEnd: sub.currentPeriodEnd,
              cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
              cancellationMode: sub.cancellationMode,
              cancellationReason: sub.cancellationReason,
              cancelledAt: sub.cancelledAt,
              cancellationRequestedAt: sub.cancellationRequestedAt,
            }
          : null,
      };
    });
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    const { _getMockSubscription } = await import('./subscriptionService');
    const list: any[] = [];
    for (const req of mockStore.values()) {
      if (!status || req.status === status) {
        const uId = req.userId.toString();
        const sub = _getMockSubscription(uId);
        list.push({
          ...req,
          userId: {
            _id: req.userId,
            fullName: 'Athil Chalil',
            email: 'athil@kudumba.test',
            familyName: 'Chalil Kudumbam',
          },
          subscription: sub
            ? {
                _id: sub._id?.toString() || `sub-${uId}`,
                status: sub.status,
                planId: sub.planId,
                planName: sub.planName,
                cadence: sub.cadence,
                priceInr: sub.priceInr,
                currentPeriodStart: sub.currentPeriodStart,
                currentPeriodEnd: sub.currentPeriodEnd,
                cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
                cancellationMode: sub.cancellationMode,
                cancellationReason: sub.cancellationReason,
                cancelledAt: sub.cancelledAt,
                cancellationRequestedAt: sub.cancellationRequestedAt,
              }
            : null,
        });
      }
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  throw new Error('Database service is currently unavailable.');
}

/**
 * Admin: Atomically approves a payment request and activates the subscription.
 * Single source of truth for subscription activation.
 */
export async function approvePaymentRequest(
  adminUserId: string,
  adminEmail: string,
  requestId: string
): Promise<{ request: IPaymentRequest | any; subscription: any }> {
  const isMockAllowed = isMockDbAllowed();

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(requestId)) {
    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      throw new Error('Payment request not found.');
    }
    if (request.status !== 'PENDING') {
      throw new Error(`Cannot approve request. Status is already ${request.status}.`);
    }
    if (!request.utrNumber) {
      throw new Error('Cannot approve request without a submitted UTR / transaction reference number.');
    }

    // 1. Mark request as APPROVED atomically
    request.status = 'APPROVED';
    request.adminVerifiedBy = new Types.ObjectId(adminUserId);
    request.adminEmail = adminEmail;
    request.verifiedAt = new Date();
    await request.save();

    // 2. Activate Subscription
    const targetPlan = getPlanConfig(request.subscriptionPlanId);
    const sub = await getOrCreateUserSubscription(request.userId.toString());

    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + request.durationMonths * 30 * 24 * 60 * 60 * 1000);

    sub.status = 'active';
    sub.planId = targetPlan.id;
    sub.planName = targetPlan.nameEn;
    sub.maxFamilyMembers = targetPlan.maxFamilyMembers;
    sub.priceInr = request.payableAmount;
    sub.cadence = request.durationMonths === 12 ? 'ANNUAL' : 'MONTHLY';
    sub.currentPeriodStart = periodStart;
    sub.currentPeriodEnd = periodEnd;
    sub.retentionStatus = 'retained_paid';
    sub.deletionScheduledAt = undefined;
    sub.lastPaymentId = request.utrNumber;
    sub.isSimulatedDev = false;
    await sub.save();

    // 3. Create permanent PaymentHistory record
    const history = await PaymentHistory.create({
      userId: request.userId,
      paymentRequestId: request._id,
      amount: request.payableAmount,
      currency: request.currency,
      utrNumber: request.utrNumber,
      planId: request.subscriptionPlanId,
      planNameSnapshot: request.planNameSnapshot,
      billingDuration: request.billingDuration,
      durationMonths: request.durationMonths,
      paymentDate: request.paymentDate || new Date(),
      verificationStatus: 'APPROVED',
      approvedBy: new Types.ObjectId(adminUserId),
      approvedByEmail: adminEmail,
      approvedAt: new Date(),
    });

    // 4. Create financial Transaction record
    await Transaction.create({
      transactionReference: `UPI-${request.utrNumber}`,
      userId: request.userId,
      subscriptionId: sub._id,
      amountInr: request.payableAmount,
      gatewayFeeInr: 0,
      taxInr: 0,
      netAmountInr: request.payableAmount,
      currency: 'INR',
      status: 'SUCCESS',
      paymentGateway: 'MANUAL',
      gatewayPaymentId: request.utrNumber,
      reconciled: true,
      reconciledAt: new Date(),
      metadata: {
        paymentRequestId: request._id.toString(),
        durationMonths: request.durationMonths,
        planId: request.subscriptionPlanId,
      },
    });

    // 5. Record Admin Audit Event
    try {
      await AdminAuditEvent.create({
        action: 'MANUAL_UPI_PAYMENT_APPROVED',
        category: 'BILLING',
        severity: 'INFO',
        adminId: adminUserId,
        adminEmail,
        targetId: request._id.toString(),
        targetType: 'PaymentRequest',
        details: {
          utrNumber: request.utrNumber,
          amount: request.payableAmount,
          planId: request.subscriptionPlanId,
          durationMonths: request.durationMonths,
        },
        outcome: 'SUCCESS',
      });
    } catch {}

    return { request, subscription: sub };
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    const req = mockStore.get(requestId);
    if (!req) {
      throw new Error('Payment request not found.');
    }
    if (req.status !== 'PENDING') {
      throw new Error(`Cannot approve request. Status is already ${req.status}.`);
    }
    if (!req.utrNumber) {
      throw new Error('Cannot approve request without a submitted UTR / transaction reference number.');
    }

    req.status = 'APPROVED';
    req.adminVerifiedBy = new mongoose.Types.ObjectId(adminUserId);
    req.adminEmail = adminEmail;
    req.verifiedAt = new Date();
    mockStore.set(requestId, req);

    const sub = await getOrCreateUserSubscription(req.userId.toString());
    const targetPlan = getPlanConfig(req.subscriptionPlanId);
    sub.status = 'active';
    sub.planId = targetPlan.id;
    sub.planName = targetPlan.nameEn;
    sub.maxFamilyMembers = targetPlan.maxFamilyMembers;
    sub.priceInr = req.payableAmount;
    sub.cadence = req.durationMonths === 12 ? 'ANNUAL' : 'MONTHLY';
    sub.currentPeriodStart = new Date();
    sub.currentPeriodEnd = new Date(Date.now() + req.durationMonths * 30 * 24 * 60 * 60 * 1000);
    sub.retentionStatus = 'retained_paid';
    sub.lastPaymentId = req.utrNumber;
    sub.isSimulatedDev = false;
    await sub.save();

    const mockHistoryStore = getMockPaymentHistories();
    const historyId = new mongoose.Types.ObjectId();
    mockHistoryStore.set(historyId.toString(), {
      _id: historyId,
      userId: req.userId,
      paymentRequestId: req._id || requestId,
      amount: req.payableAmount,
      currency: req.currency,
      utrNumber: req.utrNumber,
      planId: req.subscriptionPlanId,
      planNameSnapshot: req.planNameSnapshot,
      billingDuration: req.billingDuration,
      durationMonths: req.durationMonths,
      paymentDate: req.paymentDate || new Date(),
      verificationStatus: 'APPROVED',
      approvedBy: new mongoose.Types.ObjectId(adminUserId),
      approvedByEmail: adminEmail,
      approvedAt: new Date(),
    });

    return { request: req, subscription: sub };
  }

  throw new Error('Database service is currently unavailable.');
}

/**
 * Admin: Rejects a payment request with a mandatory reason.
 */
export async function rejectPaymentRequest(
  adminUserId: string,
  adminEmail: string,
  requestId: string,
  reason: string
): Promise<IPaymentRequest | any> {
  const isMockAllowed = isMockDbAllowed();
  const cleanReason = reason ? reason.trim() : '';
  if (!cleanReason || cleanReason.length < 5) {
    throw new Error('A detailed rejection reason (at least 5 characters) is required.');
  }

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(requestId)) {
    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      throw new Error('Payment request not found.');
    }
    if (request.status !== 'PENDING') {
      throw new Error(`Cannot reject request. Status is already ${request.status}.`);
    }

    request.status = 'REJECTED';
    request.rejectionReason = cleanReason;
    request.adminVerifiedBy = new Types.ObjectId(adminUserId);
    request.adminEmail = adminEmail;
    request.verifiedAt = new Date();
    await request.save();

    // Record rejected PaymentHistory
    if (request.utrNumber) {
      await PaymentHistory.create({
        userId: request.userId,
        paymentRequestId: request._id,
        amount: request.payableAmount,
        currency: request.currency,
        utrNumber: request.utrNumber,
        planId: request.subscriptionPlanId,
        planNameSnapshot: request.planNameSnapshot,
        billingDuration: request.billingDuration,
        durationMonths: request.durationMonths,
        paymentDate: request.paymentDate || new Date(),
        verificationStatus: 'REJECTED',
        rejectionReason: cleanReason,
        approvedBy: new Types.ObjectId(adminUserId),
        approvedByEmail: adminEmail,
        approvedAt: new Date(),
      });
    }

    // Admin Audit
    try {
      await AdminAuditEvent.create({
        action: 'MANUAL_UPI_PAYMENT_REJECTED',
        category: 'BILLING',
        severity: 'WARNING',
        adminId: adminUserId,
        adminEmail,
        targetId: request._id.toString(),
        targetType: 'PaymentRequest',
        details: {
          reason: cleanReason,
          utrNumber: request.utrNumber,
          amount: request.payableAmount,
        },
        outcome: 'SUCCESS',
      });
    } catch {}

    return request;
  } else if (isMockAllowed) {
    const mockStore = getMockPaymentRequests();
    const req = mockStore.get(requestId);
    if (!req) {
      throw new Error('Payment request not found.');
    }
    if (req.status !== 'PENDING') {
      throw new Error(`Cannot reject request. Status is already ${req.status}.`);
    }

    req.status = 'REJECTED';
    req.rejectionReason = cleanReason;
    req.adminVerifiedBy = new mongoose.Types.ObjectId(adminUserId);
    req.adminEmail = adminEmail;
    req.verifiedAt = new Date();
    mockStore.set(requestId, req);
    return req;
  }

  throw new Error('Database service is currently unavailable.');
}

/**
 * Authoritatively retrieves payment proof file for authorized viewing.
 * Prevents IDOR: only the owning user or an ADMIN can view payment proof.
 */
export async function getPaymentProofFile(
  userId: string,
  requestId: string,
  userRole?: string
): Promise<{ filePath: string; mimeType: string; originalName: string }> {
  if (
    !requestId ||
    typeof requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(requestId) ||
    requestId.includes('..') ||
    requestId.includes('/') ||
    requestId.includes('\\')
  ) {
    throw new Error('Invalid payment request ID format.');
  }

  let request: any = null;
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(requestId)) {
    request = await PaymentRequest.findById(requestId);
  } else if (isMockDbAllowed()) {
    const mockStore = getMockPaymentRequests();
    request = mockStore.get(requestId);
  }

  if (!request || !request.proofFilePath) {
    const err = new Error('Payment screenshot not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // IDOR protection: only request owner or ADMIN
  const requestUserId = (request.userId?._id || request.userId)?.toString();
  if (requestUserId !== userId && userRole !== 'ADMIN') {
    const err = new Error('Forbidden: You do not have permission to access this payment proof.');
    (err as any).statusCode = 403;
    throw err;
  }

  const filePath = path.isAbsolute(request.proofFilePath)
    ? path.normalize(request.proofFilePath)
    : path.resolve(process.cwd(), request.proofFilePath);

  const allowedBase = path.resolve(process.cwd());
  if (!filePath.startsWith(allowedBase) && !filePath.startsWith(PAYMENT_PROOFS_DIR)) {
    const err = new Error('Access denied: Invalid file path.');
    (err as any).statusCode = 403;
    throw err;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const mimeType = request.proofMimeType || mimeMap[ext] || 'image/png';

  return {
    filePath,
    mimeType,
    originalName: request.proofOriginalName || 'proof.png',
  };
}
