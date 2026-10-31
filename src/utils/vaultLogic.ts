import { VaultDocumentItem } from '../types/vault';

export type ExpiryState = 'CRITICAL' | 'WARNING' | 'HEALTHY';

export interface ExpiryEvaluation {
  state: ExpiryState;
  daysRemaining: number | null;
  iconName: 'AlertTriangle' | 'Clock' | 'CheckCircle2';
  labelEn: string;
  labelMl: string;
}

export interface TenantActor {
  tenantId: string;
  userId: string;
}

export interface TenantDocumentRecord {
  id: string;
  tenantId: string;
  createdByUserId: string;
  visibility: 'SHARED' | 'PRIVATE';
}

export interface WaitlistSubmissionInput {
  name: string;
  phoneOrEmail: string;
  familyType: string;
  districtOrCountry: string;
  preferredLang?: 'ml' | 'en';
}

/**
 * Masks the first 8 digits of any 12-digit Aadhaar number: XXXX-XXXX-1234.
 * Never returns raw first 8 digits.
 */
export function maskAadhaarNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) {
    return 'XXXX-XXXX-XXXX';
  }
  const last4 = digits.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

/**
 * Masks any sensitive document identifier by type.
 */
export function maskSensitiveNumber(raw: string, docTypeCode: string = 'GENERAL'): string {
  if (!raw || !raw.trim()) return '•••• ••••';
  if (docTypeCode.toUpperCase() === 'AADHAAR') {
    return maskAadhaarNumber(raw);
  }
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (cleaned.length <= 4) {
    return `•••• ${cleaned}`;
  }
  const last4 = cleaned.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Computes household vault completeness percentage (0 to 100).
 */
export function computeCompletenessScore(storedCount: number, recommendedTotal: number = 18): number {
  if (recommendedTotal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((storedCount / recommendedTotal) * 100)));
}

/**
 * Evaluates document expiry status with color state, icon identifier, and bilingual text labels.
 * Red (CRITICAL): Expired or <= 7 days left
 * Orange (WARNING): 8 to 60 days left
 * Green (HEALTHY): > 60 days left or no expiry required
 */
export function evaluateExpiryStatus(
  expiryDateIso: string | null | undefined,
  referenceDateIso: string = '2026-10-25'
): ExpiryEvaluation {
  if (!expiryDateIso) {
    return {
      state: 'HEALTHY',
      daysRemaining: null,
      iconName: 'CheckCircle2',
      labelEn: 'Permanent · No expiry',
      labelMl: 'സ്ഥിരം രേഖ · കാലാവധി ഇല്ല',
    };
  }

  const refTime = new Date(referenceDateIso).setUTCHours(0, 0, 0, 0);
  const expTime = new Date(expiryDateIso).setUTCHours(0, 0, 0, 0);
  const diffDays = Math.round((expTime - refTime) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return {
      state: 'CRITICAL',
      daysRemaining: diffDays,
      iconName: 'AlertTriangle',
      labelEn: `Expired ${overdue}d ago · Renew now`,
      labelMl: `കാലാവധി കഴിഞ്ഞിട്ട് ${overdue} ദിവസം · ഉടൻ പുതുക്കുക`,
    };
  }

  if (diffDays <= 7) {
    return {
      state: 'CRITICAL',
      daysRemaining: diffDays,
      iconName: 'AlertTriangle',
      labelEn: diffDays === 0 ? 'Expires today · Urgent' : `Urgent · ${diffDays}d remaining`,
      labelMl: diffDays === 0 ? 'ഇന്ന് അവസാനിക്കുന്നു · അടിയന്തരം' : `അടിയന്തരം · ${diffDays} ദിവസം ബാക്കി`,
    };
  }

  if (diffDays <= 60) {
    return {
      state: 'WARNING',
      daysRemaining: diffDays,
      iconName: 'Clock',
      labelEn: `Expiring soon · ${diffDays}d left`,
      labelMl: `ഉടൻ അവസാനിക്കും · ${diffDays} ദിവസം ബാക്കി`,
    };
  }

  return {
    state: 'HEALTHY',
    daysRemaining: diffDays,
    iconName: 'CheckCircle2',
    labelEn: `Safe · ${diffDays}d remaining`,
    labelMl: `സുരക്ഷിതം · ${diffDays} ദിവസം ബാക്കി`,
  };
}

/**
 * Determines which reminder milestone (60, 30, 7, 1, or weekly negative offset)
 * should fire next for the database Cron scheduler.
 */
export function getNextReminderMilestone(daysRemaining: number): number {
  if (daysRemaining > 60) return 60;
  if (daysRemaining > 30) return 30;
  if (daysRemaining > 7) return 7;
  if (daysRemaining >= 1) return 1;
  // Weekly after expiry: -7, -14, -21...
  const weeksOverdue = Math.floor(Math.abs(daysRemaining) / 7) + 1;
  return -(weeksOverdue * 7);
}

/**
 * Enforces strict multi-tenant isolation and private document visibility.
 * One tenant can NEVER read another tenant's document under any role.
 */
export function canAccessTenantDocument(
  actor: TenantActor,
  doc: TenantDocumentRecord
): boolean {
  if (!actor.tenantId || !doc.tenantId) return false;
  if (actor.tenantId !== doc.tenantId) {
    return false;
  }
  if (doc.visibility === 'SHARED') {
    return true;
  }
  return actor.userId === doc.createdByUserId;
}

/**
 * Validates waitlist / early access registration fields.
 */
export function validateWaitlistInput(input: WaitlistSubmissionInput): {
  valid: boolean;
  errorEn?: string;
  errorMl?: string;
} {
  const name = (input.name || '').trim();
  const contact = (input.phoneOrEmail || '').trim();
  const location = (input.districtOrCountry || '').trim();

  if (name.length < 2) {
    return {
      valid: false,
      errorEn: 'Please enter your full name.',
      errorMl: 'ദയവായി നിങ്ങളുടെ പേര് നൽകുക.',
    };
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const digitsOnly = contact.replace(/\D/g, '');
  const isPhone = digitsOnly.length >= 8 && digitsOnly.length <= 15;

  if (!isEmail && !isPhone) {
    return {
      valid: false,
      errorEn: 'Please enter a valid 10-digit mobile number (India/Gulf) or email address.',
      errorMl: 'സാധുവായ ഫോൺ നമ്പറോ ഇമെയിൽ വിലാസമോ നൽകുക.',
    };
  }

  if (location.length < 2) {
    return {
      valid: false,
      errorEn: 'Please select or enter your Kerala district or Gulf country.',
      errorMl: 'നിങ്ങളുടെ ജില്ല അല്ലെങ്കിൽ രാജ്യം തിരഞ്ഞെടുക്കുക.',
    };
  }

  return { valid: true };
}

export const BYTES_PER_GIB = 1024 * 1024 * 1024; // 1,073,741,824 bytes
export const BYTES_PER_MIB = 1024 * 1024; // 1,048,576 bytes

export interface StorageCalculationResult {
  usedBytes: number;
  quotaBytes: number;
  percentageUsed: number;
  usedGiB: number;
  quotaGiB: number;
  formattedUsed: string;
  formattedQuota: string;
}

/**
 * Calculates storage consumption percentage and human-readable units.
 * Formula: percentageUsed = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0
 * Clamped between 0 and 100%. Handles zero or missing quotas safely.
 */
export function calculateStorageUsage(
  usedBytesInput: number | undefined | null,
  quotaBytesInput: number | undefined | null
): StorageCalculationResult {
  const safeUsed = Math.max(
    0,
    typeof usedBytesInput === 'number' && !isNaN(usedBytesInput) ? usedBytesInput : 0
  );
  const safeQuota = Math.max(
    0,
    typeof quotaBytesInput === 'number' && !isNaN(quotaBytesInput) ? quotaBytesInput : 0
  );

  const rawPercent = safeQuota > 0 ? (safeUsed / safeQuota) * 100 : 0;
  const percentageUsed = Math.min(100, Math.max(0, rawPercent));

  const usedGiB = safeUsed / BYTES_PER_GIB;
  const quotaGiB = safeQuota / BYTES_PER_GIB;

  let formattedUsed: string;
  if (safeUsed === 0) {
    formattedUsed = '0.0 GiB';
  } else if (usedGiB >= 0.1) {
    formattedUsed = `${usedGiB.toFixed(1)} GiB`;
  } else {
    formattedUsed = `${(safeUsed / BYTES_PER_MIB).toFixed(1)} MiB`;
  }

  const formattedQuota = `${quotaGiB.toFixed(1)} GiB`;

  return {
    usedBytes: safeUsed,
    quotaBytes: safeQuota,
    percentageUsed: Number(percentageUsed.toFixed(1)),
    usedGiB: Number(usedGiB.toFixed(2)),
    quotaGiB: Number(quotaGiB.toFixed(1)),
    formattedUsed,
    formattedQuota,
  };
}

/**
 * Determines whether a document belongs to a specific household member.
 * Checks for:
 * 1. Authoritative memberId match (doc.memberId === member.id)
 * 2. Shared household documents ('All Family', 'All Members', 'എല്ലാ കുടുംബാംഗങ്ങളും')
 * 3. Exact full name match (case-insensitive English name or exact Malayalam name)
 * Prevents false-positive substring or first-name collisions when multiple family members share a first name.
 */
export function isDocumentForMember(
  doc: { memberId?: string; ownerEn?: string; ownerMl?: string },
  member: { id: string; nameEn?: string; nameMl?: string }
): boolean {
  if (!doc || !member) return false;

  // 1. Authoritative memberId check
  if (doc.memberId) {
    if (member.id && String(doc.memberId) === String(member.id)) {
      return true;
    }
    // If doc has a specific memberId that does NOT match this member,
    // do not fall back to name matching.
    return false;
  }

  // 2. Shared all-family document check
  const ownerEnNorm = (doc.ownerEn || '').trim().toLowerCase();
  const ownerMlNorm = (doc.ownerMl || '').trim();
  if (
    ownerEnNorm === 'all family' ||
    ownerEnNorm === 'all members' ||
    ownerEnNorm === 'all' ||
    ownerMlNorm === 'എല്ലാ കുടുംബാംഗങ്ങളും'
  ) {
    return true;
  }

  // 3. Exact full name match (trim & case-insensitive)
  const memberNameEnNorm = (member.nameEn || '').trim().toLowerCase();
  if (memberNameEnNorm && ownerEnNorm && ownerEnNorm === memberNameEnNorm) {
    return true;
  }

  if (member.nameMl && ownerMlNorm && ownerMlNorm === member.nameMl.trim()) {
    return true;
  }

  return false;
}

export interface MemberSeatsUsage {
  currentMembers: number;
  maximumSeats: number;
  remainingSeats: number;
  usagePercentage: number;
  isLimitReached: boolean;
  isLimitExceeded: boolean;
}

/**
 * Calculates authoritative family member seat allocation, headroom, and consumption percentage.
 * Formula:
 *   remainingSeats = Math.max(0, maximumSeats - currentMembers)
 *   usagePercentage = maximumSeats > 0 ? Math.min(100, (currentMembers / maximumSeats) * 100) : 0
 *
 * Guarantees:
 * - remainingSeats is never negative.
 * - usagePercentage is clamped to [0, 100].
 * - handles 0, negative, undefined or null values safely.
 */
export function calculateMemberSeatsUsage(
  currentMembersInput?: number | null,
  maximumSeatsInput?: number | null
): MemberSeatsUsage {
  const currentMembers = Math.max(0, Math.floor(Number(currentMembersInput) || 0));
  const maximumSeats = Math.max(0, Math.floor(Number(maximumSeatsInput) || 0));
  const remainingSeats = Math.max(0, maximumSeats - currentMembers);
  const rawPercentage = maximumSeats > 0 ? (currentMembers / maximumSeats) * 100 : 0;
  const usagePercentage = Math.min(100, Math.max(0, rawPercentage));

  return {
    currentMembers,
    maximumSeats,
    remainingSeats,
    usagePercentage: Number(usagePercentage.toFixed(1)),
    isLimitReached: maximumSeats > 0 && currentMembers >= maximumSeats,
    isLimitExceeded: currentMembers > maximumSeats,
  };
}


