import mongoose, { Types } from 'mongoose';
import { Subscription, ISubscription, SubscriptionStatus } from '../models/Subscription';
import { PaymentRequest, IPaymentRequest, getMockPaymentRequests } from '../models/PaymentRequest';
import { PaymentHistory, IPaymentHistory, getMockPaymentHistories } from '../models/PaymentHistory';
import { UserSettings, getMockUserSettingsByUserId } from '../models/UserSettings';
import { User, isMockDbAllowed, findMockUserById } from '../models/User';
import { UpiConfig, getMockUpiConfig } from '../models/UpiConfig';
import { getPlanConfig, AUTHORITATIVE_PLANS } from '../config/planConfig';
import {
  evaluateUserEntitlement,
  getOrCreateUserSubscription,
  EntitlementStatus,
  _getMockSubscription,
} from './subscriptionService';

export interface BillingOverviewData {
  subscription: {
    planId: string;
    planName: string;
    status: SubscriptionStatus;
    priceInr: number;
    cadence: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    trialStart?: string;
    trialEnd?: string;
    cancelAtPeriodEnd: boolean;
    cancelledAt?: string;
  };
  entitlements: EntitlementStatus;
  currentPlan: {
    id: string;
    nameEn: string;
    nameMl: string;
    storageQuotaBytes: number;
    maxFamilyMembers: number;
    maxFileSizeMb: number;
  };
  unifiedStatus:
    | 'FREE'
    | 'ACTIVE'
    | 'PENDING PAYMENT'
    | 'CANCELLATION SCHEDULED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'PAYMENT REJECTED';
  statusBadge: {
    labelEn: string;
    labelMl: string;
    type: 'success' | 'warning' | 'error' | 'neutral' | 'info';
  };
  latestApprovedPayment: {
    id: string;
    paymentRequestId?: string;
    amount: number;
    currency: string;
    utrNumber: string;
    paymentDate: string;
    paymentChannel: string;
    verificationStatus: 'APPROVED';
    approvedAt: string;
    approvedByEmail?: string;
  } | null;
  activeRequest: {
    id: string;
    subscriptionPlanId: string;
    planNameSnapshot: string;
    payableAmount: number;
    utrNumber?: string;
    paymentDate?: string;
    status: 'PENDING' | 'REJECTED';
    rejectionReason?: string;
    billingDuration: string;
  } | null;
  billingCycle: string;
  expiryOrRenewalDate: string | null;
  cancellation: {
    isScheduled: boolean;
    cancelAtPeriodEnd: boolean;
    cancelledAt?: string;
    effectiveUntil?: string;
    daysRemaining?: number;
  };
  notice: {
    isMaintenance: boolean;
    messageEn: string;
    messageMl: string;
    supportEmail: string;
    whatsappNumber: string;
  } | null;
}

export interface BillingHistoryItem {
  id: string;
  invoiceNumber: string;
  date: string;
  description: string;
  planId: string;
  planName: string;
  billingDuration: string;
  durationMonths: number;
  amount: number;
  currency: string;
  status: 'PAID' | 'PENDING' | 'REJECTED' | 'CANCELLED';
  utrNumber?: string;
  hasReceipt: boolean;
  receiptId?: string;
  rejectionReason?: string;
  approvedAt?: string;
}

export interface BillingHistoryResponse {
  records: BillingHistoryItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface BillingReceiptData {
  receiptNumber: string;
  receiptDate: string;
  customerName: string;
  householdName: string;
  customerEmail: string;
  billingAddress: {
    fullName?: string;
    houseBuilding?: string;
    streetLocality?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    phone?: string;
  } | null;
  planId: string;
  planName: string;
  billingDuration: string;
  durationMonths: number;
  amountPaid: number;
  currency: string;
  utrNumber: string;
  paymentMethod: string;
  status: 'PAID';
  verifiedBy: string;
  verifiedAt: string;
  disclaimer: string;
}

/**
 * Generates consistent, deterministic receipt / invoice numbers.
 * Format: KV-YYYY-XXXX (where XXXX is last 4 characters of UTR or ID).
 */
export function formatReceiptNumber(date: Date | string, utrOrId?: string): string {
  const year = new Date(date).getFullYear();
  let code = 'KV01';
  if (utrOrId) {
    const clean = utrOrId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    code = clean.slice(-4) || 'KV01';
  }
  return `KV-${year}-${code}`;
}

/**
 * 1. GET BILLING OVERVIEW
 * Single authoritative source of truth for the authenticated user's billing dashboard.
 */
export async function getBillingOverview(userId: string): Promise<BillingOverviewData> {
  const isMockAllowed = isMockDbAllowed();
  const entitlement = await evaluateUserEntitlement(userId);
  const planConfig = getPlanConfig(entitlement.planId);

  let sub: any = null;
  let activePendingRequest: any = null;
  let latestRejectedRequest: any = null;
  let latestApprovedHistory: any = null;
  let upiConfig: any = null;

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    sub = await Subscription.findOne({ userId: new Types.ObjectId(userId) });
    activePendingRequest = await PaymentRequest.findOne({
      userId: new Types.ObjectId(userId),
      status: 'PENDING',
    }).sort({ createdAt: -1 });

    if (!activePendingRequest) {
      latestRejectedRequest = await PaymentRequest.findOne({
        userId: new Types.ObjectId(userId),
        status: 'REJECTED',
      }).sort({ createdAt: -1 });
    }

    latestApprovedHistory = await PaymentHistory.findOne({
      userId: new Types.ObjectId(userId),
      verificationStatus: 'APPROVED',
    }).sort({ paymentDate: -1, createdAt: -1 });

    upiConfig = await UpiConfig.findOne({ key: 'global_upi' });
  } else if (isMockAllowed) {
    sub = _getMockSubscription(userId);
    const mockReqStore = getMockPaymentRequests();
    const userReqs = Array.from(mockReqStore.values()).filter(
      (r: any) => r.userId && r.userId.toString() === userId.toString()
    );

    // Sort descending by date
    userReqs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    activePendingRequest = userReqs.find((r) => r.status === 'PENDING') || null;
    if (!activePendingRequest) {
      latestRejectedRequest = userReqs.find((r) => r.status === 'REJECTED') || null;
    }

    const mockHistStore = getMockPaymentHistories();
    const userHists = Array.from(mockHistStore.values()).filter(
      (h: any) => h.userId && h.userId.toString() === userId.toString() && h.verificationStatus === 'APPROVED'
    );
    userHists.sort((a, b) => new Date(b.paymentDate || b.createdAt || 0).getTime() - new Date(a.paymentDate || a.createdAt || 0).getTime());
    latestApprovedHistory = userHists[0] || null;

    upiConfig = getMockUpiConfig();
  }

  if (!sub) {
    sub = await getOrCreateUserSubscription(userId);
  }

  // 1. Resolve Unified Billing Status (Requirement 2)
  const now = Date.now();
  const currentPeriodEndTime = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : 0;
  const isCancellationScheduled = Boolean(sub.cancelAtPeriodEnd && currentPeriodEndTime > now);

  let unifiedStatus: BillingOverviewData['unifiedStatus'] = 'FREE';
  let statusBadge: BillingOverviewData['statusBadge'] = {
    labelEn: 'FREE FOUNDING TIER',
    labelMl: 'സൗജന്യ ഫൗണ്ടിംഗ് പ്ലാൻ',
    type: 'neutral',
  };

  if (activePendingRequest) {
    unifiedStatus = 'PENDING PAYMENT';
    statusBadge = {
      labelEn: 'PAYMENT PENDING VERIFICATION',
      labelMl: 'പരിശോധനയിലാണ്',
      type: 'warning',
    };
  } else if (latestRejectedRequest && sub.status !== 'active') {
    unifiedStatus = 'PAYMENT REJECTED';
    statusBadge = {
      labelEn: 'PAYMENT REJECTED',
      labelMl: 'നിരസിച്ചു',
      type: 'error',
    };
  } else if (isCancellationScheduled) {
    unifiedStatus = 'CANCELLATION SCHEDULED';
    statusBadge = {
      labelEn: 'CANCELLATION SCHEDULED',
      labelMl: 'റദ്ദാക്കൽ ഷെഡ്യൂൾ ചെയ്തു',
      type: 'warning',
    };
  } else if (sub.status === 'canceled') {
    unifiedStatus = 'CANCELLED';
    statusBadge = {
      labelEn: 'SUBSCRIPTION CANCELLED',
      labelMl: 'റദ്ദാക്കി',
      type: 'neutral',
    };
  } else if (sub.status === 'expired' || entitlement.trialExpired) {
    unifiedStatus = 'EXPIRED';
    statusBadge = {
      labelEn: 'SUBSCRIPTION EXPIRED',
      labelMl: 'കാലഹരണപ്പെട്ടു',
      type: 'error',
    };
  } else if (sub.status === 'active') {
    unifiedStatus = 'ACTIVE';
    statusBadge = {
      labelEn: 'SUBSCRIPTION ACTIVE',
      labelMl: 'ആക്ടീവ് സബ്‌സ്‌ക്രിപ്ഷൻ',
      type: 'success',
    };
  } else if (entitlement.isTrialing) {
    unifiedStatus = 'FREE';
    statusBadge = {
      labelEn: 'FREE TRIAL ACTIVE',
      labelMl: 'സൗജന്യ ട്രയൽ ആക്ടീവ്',
      type: 'info',
    };
  }

  // 2. Resolve Billing Cycle
  let billingCycle = 'Free Tier';
  if (sub.status === 'active' || activePendingRequest) {
    const duration = activePendingRequest?.billingDuration || (sub.cadence === 'ANNUAL' ? 'yearly' : 'monthly');
    if (duration === 'yearly') billingCycle = '1 Year (Annual)';
    else if (duration === 'quarterly') billingCycle = '3 Months (Quarterly)';
    else if (duration === 'monthly') billingCycle = '1 Month (Monthly)';
  } else if (entitlement.isTrialing) {
    billingCycle = '3-Day Free Trial';
  }

  // 3. Resolve Expiry or Renewal Date
  let expiryOrRenewalDate: string | null = null;
  if (sub.currentPeriodEnd) {
    expiryOrRenewalDate = new Date(sub.currentPeriodEnd).toISOString();
  } else if (sub.trialEnd) {
    expiryOrRenewalDate = new Date(sub.trialEnd).toISOString();
  }

  // 4. Resolve Cancellation Info
  let daysRemainingInTerm = 0;
  if (currentPeriodEndTime > now) {
    daysRemainingInTerm = Math.max(0, Math.ceil((currentPeriodEndTime - now) / (1000 * 60 * 60 * 24)));
  }

  // 5. Build Notice Configuration (Requirement 8)
  const supportEmail = upiConfig?.supportEmail || 'support@kudumbavault.com';
  const whatsappNumber = upiConfig?.whatsappNumber || '+91 90612 64525';
  let notice: BillingOverviewData['notice'] = null;

  if (upiConfig && !upiConfig.isEnabled) {
    notice = {
      isMaintenance: true,
      messageEn: `Online payment processing is temporarily undergoing maintenance. Please contact Kudumba Vault support at ${supportEmail} for plan upgrades and billing assistance.`,
      messageMl: `ഓൺലൈൻ പേയ്‌മെന്റ് സംവിധാനം താൽക്കാലികമായി മെയിന്റനൻസിലാണ്. പ്ലാൻ മാറ്റങ്ങൾക്കായി ${supportEmail} വിലാസത്തിൽ ബന്ധപ്പെടുക.`,
      supportEmail,
      whatsappNumber,
    };
  } else {
    notice = {
      isMaintenance: false,
      messageEn: `All subscription upgrades are processed via direct manual UPI transfer and verified manually by Kudumba Vault administration. For billing assistance, contact support at ${supportEmail} or WhatsApp ${whatsappNumber}.`,
      messageMl: `കുടുംബ വോൾട്ട് പ്ലാൻ അപ്‌ഗ്രേഡുകൾ മാനുവൽ യു.പി.ഐ വഴി പൂർത്തിയാക്കി അഡ്മിൻ നേരിട്ട് സ്ഥിരീകരിക്കുന്നതാണ്. കൂടുതൽ വിവരങ്ങൾക്ക് ${supportEmail} അല്ലെങ്കിൽ WhatsApp ${whatsappNumber} വഴി ബന്ധപ്പെടാം.`,
      supportEmail,
      whatsappNumber,
    };
  }

  // 6. Format Latest Approved Payment
  let formattedApprovedPayment: BillingOverviewData['latestApprovedPayment'] = null;
  if (latestApprovedHistory) {
    formattedApprovedPayment = {
      id: latestApprovedHistory._id ? latestApprovedHistory._id.toString() : String(latestApprovedHistory.id || ''),
      paymentRequestId: latestApprovedHistory.paymentRequestId?.toString(),
      amount: latestApprovedHistory.amount,
      currency: latestApprovedHistory.currency || 'INR',
      utrNumber: latestApprovedHistory.utrNumber,
      paymentDate: new Date(latestApprovedHistory.paymentDate || latestApprovedHistory.createdAt).toISOString(),
      paymentChannel: 'Manual UPI QR Transfer',
      verificationStatus: 'APPROVED',
      approvedAt: new Date(latestApprovedHistory.approvedAt || latestApprovedHistory.createdAt).toISOString(),
      approvedByEmail: latestApprovedHistory.approvedByEmail,
    };
  }

  // 7. Format Active Pending or Rejected Request
  let formattedActiveRequest: BillingOverviewData['activeRequest'] = null;
  const targetReq = activePendingRequest || latestRejectedRequest;
  if (targetReq) {
    formattedActiveRequest = {
      id: targetReq._id ? targetReq._id.toString() : String(targetReq.id || ''),
      subscriptionPlanId: targetReq.subscriptionPlanId,
      planNameSnapshot: targetReq.planNameSnapshot,
      payableAmount: targetReq.payableAmount,
      utrNumber: targetReq.utrNumber,
      paymentDate: targetReq.paymentDate ? new Date(targetReq.paymentDate).toISOString() : undefined,
      status: targetReq.status,
      rejectionReason: targetReq.rejectionReason,
      billingDuration: targetReq.billingDuration,
    };
  }

  return {
    subscription: {
      planId: sub.planId,
      planName: sub.planName,
      status: sub.status,
      priceInr: sub.priceInr || 0,
      cadence: sub.cadence || 'FREE',
      currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toISOString() : undefined,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : undefined,
      trialStart: sub.trialStart ? new Date(sub.trialStart).toISOString() : undefined,
      trialEnd: sub.trialEnd ? new Date(sub.trialEnd).toISOString() : undefined,
      cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
      cancelledAt: sub.cancelledAt ? new Date(sub.cancelledAt).toISOString() : undefined,
    },
    entitlements: entitlement,
    currentPlan: {
      id: planConfig.id,
      nameEn: planConfig.nameEn,
      nameMl: planConfig.nameMl,
      storageQuotaBytes: planConfig.storageQuotaBytes,
      maxFamilyMembers: planConfig.maxFamilyMembers,
      maxFileSizeMb: Math.round(planConfig.maxFileSizeBytes / (1024 * 1024)),
    },
    unifiedStatus,
    statusBadge,
    latestApprovedPayment: formattedApprovedPayment,
    activeRequest: formattedActiveRequest,
    billingCycle,
    expiryOrRenewalDate,
    cancellation: {
      isScheduled: isCancellationScheduled,
      cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
      cancelledAt: sub.cancelledAt ? new Date(sub.cancelledAt).toISOString() : undefined,
      effectiveUntil: expiryOrRenewalDate || undefined,
      daysRemaining: daysRemainingInTerm,
    },
    notice,
  };
}

/**
 * 2. GET BILLING HISTORY
 * Returns paginated genuine transaction records for the authenticated household.
 */
export async function getBillingHistory(
  userId: string,
  page = 1,
  limit = 10
): Promise<BillingHistoryResponse> {
  const isMockAllowed = isMockDbAllowed();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));

  let allRequests: any[] = [];
  let allHistories: any[] = [];

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    allRequests = await PaymentRequest.find({ userId: new Types.ObjectId(userId) }).lean();
    allHistories = await PaymentHistory.find({ userId: new Types.ObjectId(userId) }).lean();
  } else if (isMockAllowed) {
    const mockReqStore = getMockPaymentRequests();
    allRequests = Array.from(mockReqStore.values()).filter(
      (r: any) => r.userId && r.userId.toString() === userId.toString()
    );
    const mockHistStore = getMockPaymentHistories();
    allHistories = Array.from(mockHistStore.values()).filter(
      (h: any) => h.userId && h.userId.toString() === userId.toString()
    );
  }

  // Create a unified list of transaction rows
  // Map of paymentRequestId -> PaymentHistory record
  const historyMap = new Map<string, any>();
  for (const hist of allHistories) {
    if (hist.paymentRequestId) {
      historyMap.set(hist.paymentRequestId.toString(), hist);
    }
  }

  const items: BillingHistoryItem[] = [];

  for (const req of allRequests) {
    const reqId = req._id ? req._id.toString() : String(req.id || '');
    const matchedHistory = historyMap.get(reqId);

    const isPaid = req.status === 'APPROVED' || matchedHistory?.verificationStatus === 'APPROVED';
    const isRejected = req.status === 'REJECTED';
    const isCancelled = req.status === 'CANCELLED';
    const isPending = req.status === 'PENDING';

    const date = matchedHistory?.paymentDate || req.paymentDate || req.createdAt || new Date();
    const utr = req.utrNumber || matchedHistory?.utrNumber;
    const invNumber = formatReceiptNumber(date, utr || reqId);

    let status: BillingHistoryItem['status'] = 'PENDING';
    if (isPaid) status = 'PAID';
    else if (isRejected) status = 'REJECTED';
    else if (isCancelled) status = 'CANCELLED';

    items.push({
      id: reqId,
      invoiceNumber: invNumber,
      date: new Date(date).toISOString(),
      description: `${req.planNameSnapshot || 'Subscription'} (${req.billingDuration || '1 month'})`,
      planId: req.subscriptionPlanId || req.planId,
      planName: req.planNameSnapshot || 'Kudumba Vault Plan',
      billingDuration: req.billingDuration || 'monthly',
      durationMonths: req.durationMonths || 1,
      amount: req.payableAmount || matchedHistory?.amount || 0,
      currency: req.currency || matchedHistory?.currency || 'INR',
      status,
      utrNumber: utr,
      hasReceipt: isPaid,
      receiptId: isPaid ? reqId : undefined,
      rejectionReason: req.rejectionReason,
      approvedAt: matchedHistory?.approvedAt ? new Date(matchedHistory.approvedAt).toISOString() : undefined,
    });
  }

  // Also include any standalone approved PaymentHistories that weren't linked to a PaymentRequest in allRequests
  for (const hist of allHistories) {
    const histReqId = hist.paymentRequestId ? hist.paymentRequestId.toString() : '';
    const alreadyIncluded = items.some((item) => item.id === histReqId);
    if (!alreadyIncluded && hist.verificationStatus === 'APPROVED') {
      const histId = hist._id ? hist._id.toString() : String(hist.id || '');
      const date = hist.paymentDate || hist.createdAt || new Date();
      items.push({
        id: histId,
        invoiceNumber: formatReceiptNumber(date, hist.utrNumber || histId),
        date: new Date(date).toISOString(),
        description: `${hist.planNameSnapshot || 'Subscription'} (${hist.billingDuration || '1 month'})`,
        planId: hist.planId,
        planName: hist.planNameSnapshot || 'Kudumba Vault Plan',
        billingDuration: hist.billingDuration || 'monthly',
        durationMonths: hist.durationMonths || 1,
        amount: hist.amount,
        currency: hist.currency || 'INR',
        status: 'PAID',
        utrNumber: hist.utrNumber,
        hasReceipt: true,
        receiptId: histId,
        approvedAt: hist.approvedAt ? new Date(hist.approvedAt).toISOString() : undefined,
      });
    }
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = items.length;
  const totalPages = Math.ceil(total / safeLimit) || 1;
  const startIndex = (safePage - 1) * safeLimit;
  const paginatedRecords = items.slice(startIndex, startIndex + safeLimit);

  return {
    records: paginatedRecords,
    total,
    page: safePage,
    totalPages,
  };
}

/**
 * 3. GET BILLING RECEIPT
 * Securely retrieves verified receipt data for an authorized payment.
 * Security: Strictly enforces that the caller owns the payment record and it is genuinely APPROVED.
 */
export async function getBillingReceipt(userId: string, paymentId: string): Promise<BillingReceiptData> {
  const isMockAllowed = isMockDbAllowed();
  if (!paymentId) {
    throw new Error('Payment ID is required.');
  }

  let payment: any = null;
  let user: any = null;
  let userSettings: any = null;

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId);
    userSettings = await UserSettings.findOne({ userId: new Types.ObjectId(userId) });

    if (Types.ObjectId.isValid(paymentId)) {
      payment = await PaymentRequest.findById(paymentId);
      if (!payment) {
        payment = await PaymentHistory.findById(paymentId);
      }
    }
  } else if (isMockAllowed) {
    user = findMockUserById(userId);
    userSettings = getMockUserSettingsByUserId(userId);

    const mockReqStore = getMockPaymentRequests();
    payment = mockReqStore.get(paymentId);
    if (!payment) {
      const mockHistStore = getMockPaymentHistories();
      payment = mockHistStore.get(paymentId);
    }
  }

  if (!payment) {
    throw new Error('Payment record not found.');
  }

  // Security Verification: Verify ownership
  const paymentUserId = payment.userId ? payment.userId.toString() : '';
  if (paymentUserId !== userId.toString()) {
    throw new Error('Unauthorized access: You cannot access billing records of another household.');
  }

  // Verify genuinely approved status
  const isApproved =
    payment.status === 'APPROVED' || payment.verificationStatus === 'APPROVED';
  if (!isApproved) {
    throw new Error('Receipts can only be generated for approved and completed payments.');
  }

  const paymentDate = payment.paymentDate || payment.createdAt || new Date();
  const utr = payment.utrNumber || 'N/A';
  const receiptNumber = formatReceiptNumber(paymentDate, utr);

  const billingAddr = payment.billingAddressSnapshot || userSettings?.billingAddress || null;

  return {
    receiptNumber,
    receiptDate: new Date(paymentDate).toISOString(),
    customerName: user?.name || billingAddr?.fullName || 'Kudumba Vault Member',
    householdName: user?.householdName || user?.familyProfile?.name || 'Kudumba Household',
    customerEmail: user?.email || '',
    billingAddress: billingAddr
      ? {
          fullName: billingAddr.fullName,
          houseBuilding: billingAddr.houseBuilding,
          streetLocality: billingAddr.streetLocality,
          city: billingAddr.city,
          state: billingAddr.state,
          country: billingAddr.country || 'India',
          postalCode: billingAddr.postalCode,
          phone: billingAddr.phone,
        }
      : null,
    planId: payment.subscriptionPlanId || payment.planId || 'nri-plus',
    planName: payment.planNameSnapshot || 'NRI Family Plus',
    billingDuration: payment.billingDuration || 'monthly',
    durationMonths: payment.durationMonths || 1,
    amountPaid: payment.payableAmount || payment.amount || 0,
    currency: payment.currency || 'INR',
    utrNumber: utr,
    paymentMethod: 'Manual UPI QR Transfer',
    status: 'PAID',
    verifiedBy: payment.adminEmail || 'Kudumba Vault Administration',
    verifiedAt: new Date(payment.verifiedAt || payment.approvedAt || paymentDate).toISOString(),
    disclaimer:
      'This document is an official payment confirmation and receipt issued by Kudumba Vault. It is not a GST tax invoice.',
  };
}

/**
 * 4. CANCEL SUBSCRIPTION
 * Schedules cancellation at period end or immediately cancels subscription.
 */
export async function cancelUserSubscription(
  userId: string,
  cancelAtPeriodEnd = true,
  reason = ''
): Promise<{ ok: boolean; message: string; sub: ISubscription | any }> {
  const isMockAllowed = isMockDbAllowed();
  let sub: any = null;

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    sub = await Subscription.findOne({ userId: new Types.ObjectId(userId) });
    if (!sub) {
      throw new Error('Active subscription not found.');
    }

    sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
    sub.cancelledAt = new Date();
    sub.cancellationMode = cancelAtPeriodEnd ? 'END_OF_PERIOD' : 'IMMEDIATE';
    if (reason) {
      sub.cancellationReason = reason.trim();
    }
    if (!cancelAtPeriodEnd) {
      sub.status = 'canceled';
    }
    await sub.save();
  } else if (isMockAllowed) {
    sub = _getMockSubscription(userId);
    if (!sub) {
      sub = await getOrCreateUserSubscription(userId);
    }
    sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
    sub.cancelledAt = new Date();
    sub.cancellationMode = cancelAtPeriodEnd ? 'END_OF_PERIOD' : 'IMMEDIATE';
    if (reason) {
      sub.cancellationReason = reason.trim();
    }
    if (!cancelAtPeriodEnd) {
      sub.status = 'canceled';
    }
    await sub.save();
  }

  const message = cancelAtPeriodEnd
    ? 'Subscription cancellation scheduled at end of current billing period.'
    : 'Subscription cancelled immediately.';

  return { ok: true, message, sub };
}
