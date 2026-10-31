import { VaultDocumentItem, HouseholdMemberItem } from '../types/vault';
import { maskSensitiveNumber } from '../utils/vaultLogic';
import { sendEmail } from './mailer';
import { buildExpiryEmailContent, getEmailAttachments } from './emailTemplates';
import { NotificationTracker, notificationTracker } from './notificationTracker';
import { INotificationPreferences } from '../models/UserSettings';

export interface MilestoneEvaluation {
  shouldNotify: boolean;
  milestone: number; // 60, 30, 7, 1, 0, or negative overdue (-7, -14)
  urgency: 'NOTICE' | 'WARNING' | 'CRITICAL';
}

/**
 * Evaluates document expiry status into notification milestone brackets.
 * Supports:
 * - Case A: Already Expired (daysRemaining < 0) -> Milestone -1 (CRITICAL)
 * - Case B: Expiring Today (daysRemaining === 0) -> Milestone 0 (CRITICAL)
 * - Case B: Expiring Tomorrow (daysRemaining === 1) -> Milestone 1 (CRITICAL)
 * - Case B: Expiring in 2..7 days (daysRemaining <= 7) -> Milestone 7 (WARNING)
 * - Case B: Expiring in 8..windowDays (daysRemaining <= reminderWindowDays, default 30) -> Milestone 30 (NOTICE)
 * - Case C: Not expiring soon (daysRemaining > reminderWindowDays) -> shouldNotify: false
 */
export function evaluateMilestoneBracket(
  daysRemaining: number,
  reminderWindowDays: number = 30
): {
  shouldNotify: boolean;
  milestone: number;
  urgency: 'NOTICE' | 'WARNING' | 'CRITICAL';
  isExpired: boolean;
} {
  // Case A: Already expired
  if (daysRemaining < 0) {
    return {
      shouldNotify: true,
      milestone: -1,
      urgency: 'CRITICAL',
      isExpired: true,
    };
  }

  // Case B: Expires today
  if (daysRemaining === 0) {
    return {
      shouldNotify: true,
      milestone: 0,
      urgency: 'CRITICAL',
      isExpired: true,
    };
  }

  // Case B: Expires in 1 day
  if (daysRemaining === 1) {
    return {
      shouldNotify: true,
      milestone: 1,
      urgency: 'CRITICAL',
      isExpired: false,
    };
  }

  // Case B: Expires in 2 to 7 days
  if (daysRemaining <= 7) {
    return {
      shouldNotify: true,
      milestone: 7,
      urgency: 'WARNING',
      isExpired: false,
    };
  }

  // Case B: Expires in 8 to reminderWindowDays (e.g. 30 days)
  if (daysRemaining <= reminderWindowDays) {
    return {
      shouldNotify: true,
      milestone: 30,
      urgency: 'NOTICE',
      isExpired: false,
    };
  }

  // Case C: Outside reminder window
  return {
    shouldNotify: false,
    milestone: daysRemaining,
    urgency: 'NOTICE',
    isExpired: false,
  };
}

export interface SingleDocNotificationParams {
  document: {
    id?: string;
    _id?: any;
    title: string;
    category?: string;
    categoryEn?: string;
    docNumber?: string;
    authorityEn?: string;
    expiryDate?: Date | string | null;
    ownerNameEn?: string;
    memberId?: string;
  };
  user: {
    id: string;
    email: string;
    name?: string;
  };
  reason?: 'upload' | 'update' | 'manual';
  referenceDate?: Date;
  timeZone?: string;
  reminderWindowDays?: number;
  tracker?: NotificationTracker;
  baseUrl?: string;
  notificationPreferences?: Partial<INotificationPreferences>;
}

export interface SingleDocNotificationResult {
  notified: boolean;
  status:
    | 'sent'
    | 'skipped_not_expiring'
    | 'skipped_duplicate'
    | 'skipped_no_expiry'
    | 'skipped_no_email'
    | 'skipped_preference_disabled'
    | 'failed';
  daysRemaining?: number;
  milestone?: number;
  messageId?: string;
  error?: string;
}

/**
 * Immediately evaluates a newly uploaded or updated document and triggers an expiry email notification
 * if the document is already expired (Case A) or expiring soon inside the reminder window (Case B).
 * Enforces atomic deduplication, resilient error boundaries, and safe logging.
 */
export async function checkAndDispatchDocumentExpiryNotification(
  params: SingleDocNotificationParams
): Promise<SingleDocNotificationResult> {
  const {
    document,
    user,
    referenceDate,
    timeZone = 'Asia/Kolkata',
    reminderWindowDays = parseInt(process.env.EXPIRY_REMINDER_WINDOW_DAYS || '30', 10),
    tracker = notificationTracker,
    baseUrl = process.env.APP_URL || 'http://localhost:3000',
  } = params;

  // Case D: No expiry date
  if (!document || !document.expiryDate) {
    return { notified: false, status: 'skipped_no_expiry' };
  }

  let expiryDateStr = '';
  if (document.expiryDate instanceof Date) {
    expiryDateStr = document.expiryDate.toISOString().slice(0, 10);
  } else if (typeof document.expiryDate === 'string' && document.expiryDate.trim()) {
    expiryDateStr = document.expiryDate.trim().slice(0, 10);
  }

  if (!expiryDateStr || expiryDateStr.length !== 10) {
    return { notified: false, status: 'skipped_no_expiry' };
  }

  const docId = (document.id || document._id)?.toString();
  if (!docId) {
    return { notified: false, status: 'skipped_no_expiry', error: 'Missing document ID' };
  }

  // Validate authenticated user email
  const targetEmail = (user.email || '').trim().toLowerCase();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail);
  if (!isEmailValid) {
    return {
      notified: false,
      status: 'skipped_no_email',
      error: 'Authenticated user account has no valid recipient email.',
    };
  }

  // Calculate calendar days remaining in target timezone
  const days = calculateDaysRemainingInTimezone(expiryDateStr, referenceDate, timeZone);
  if (days === null) {
    return { notified: false, status: 'skipped_no_expiry', error: 'Failed to calculate days remaining' };
  }

  // Evaluate milestone eligibility
  const evalResult = evaluateMilestoneBracket(days, reminderWindowDays);
  if (!evalResult.shouldNotify) {
    // Case C: Outside reminder window
    return {
      notified: false,
      status: 'skipped_not_expiring',
      daysRemaining: days,
      milestone: evalResult.milestone,
    };
  }

  const milestone = evalResult.milestone;

  // Check notification milestone preferences if supplied
  if (params.notificationPreferences) {
    const prefs = params.notificationPreferences;
    let disabled = false;
    if (milestone === 60 && prefs.reminder60Days === false) disabled = true;
    else if (milestone === 30 && prefs.reminder30Days === false) disabled = true;
    else if ((milestone === 7 || milestone === 1 || milestone === 0) && prefs.reminder7Days === false) disabled = true;
    else if (milestone === -1 && prefs.reminderExpired === false) disabled = true;

    if (disabled) {
      return {
        notified: false,
        status: 'skipped_preference_disabled',
        daysRemaining: days,
        milestone,
      };
    }
  }

  // Deduplication check: Has this notification already been sent for this document & expiry date?
  const alreadySent = await tracker.hasBeenSentAsync(docId, targetEmail, milestone, expiryDateStr);
  if (alreadySent) {
    return {
      notified: false,
      status: 'skipped_duplicate',
      daysRemaining: days,
      milestone,
    };
  }

  // Claim atomic lock for dispatch
  const claimed = tracker.claimForDispatch(
    docId,
    user.id,
    targetEmail,
    milestone,
    expiryDateStr
  );
  if (!claimed) {
    return {
      notified: false,
      status: 'skipped_duplicate',
      daysRemaining: days,
      milestone,
    };
  }

  // Build clean, professional, branded email content
  const recipientName = user.name || document.ownerNameEn || 'Family Member';
  const maskedNumber = maskSensitiveNumber(document.docNumber || '');
  const emailContent = buildExpiryEmailContent({
    recipientName,
    documentTitle: document.title,
    documentCategory: document.category || document.categoryEn || 'Document',
    authorityName: document.authorityEn || 'Official Authority',
    maskedNumber,
    expiryDateStr,
    daysRemaining: days,
    milestone,
    preferredLang: 'ml',
    vaultUrl: `${baseUrl}`,
  });

  // Dispatch via Gmail SMTP with inline CID attachments
  const attachments = getEmailAttachments();
  try {
    const sendResult = await sendEmail({
      to: targetEmail,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      attachments,
    });

    if (sendResult.success) {
      tracker.markSent(docId, targetEmail, milestone, expiryDateStr, sendResult.messageId);
      console.log(
        `[Notification] Successfully dispatched expiry alert to ${targetEmail} for document "${document.title}" (milestone: ${milestone}, days: ${days})`
      );
      return {
        notified: true,
        status: 'sent',
        daysRemaining: days,
        milestone,
        messageId: sendResult.messageId,
      };
    } else {
      tracker.markFailed(docId, targetEmail, milestone, expiryDateStr, sendResult.error || 'SMTP delivery failure');
      console.warn(
        `[Notification] SMTP delivery failed for document "${document.title}" to ${targetEmail}: ${sendResult.error}`
      );
      return {
        notified: false,
        status: 'failed',
        daysRemaining: days,
        milestone,
        error: sendResult.error,
      };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    tracker.markFailed(docId, targetEmail, milestone, expiryDateStr, errorMsg);
    console.error(`[Notification] Unexpected send error for document "${document.title}":`, errorMsg);
    return {
      notified: false,
      status: 'failed',
      daysRemaining: days,
      milestone,
      error: errorMsg,
    };
  }
}

/**
 * Calculates calendar days remaining based on the Asia/Kolkata timezone (IST: UTC+5:30).
 * Prevents UTC day-rollover edge cases from miscalculating target dates.
 */
export function calculateDaysRemainingInTimezone(
  expiryDateStr: string | null | undefined,
  referenceDate?: Date,
  timeZone: string = 'Asia/Kolkata'
): number | null {
  if (!expiryDateStr || !expiryDateStr.trim()) return null;

  // Validate date format YYYY-MM-DD
  const parts = expiryDateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  // Reference date in target timezone
  const now = referenceDate || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayParts = formatter.format(now).split('-');
  const todayYear = parseInt(todayParts[0], 10);
  const todayMonth = parseInt(todayParts[1], 10) - 1;
  const todayDay = parseInt(todayParts[2], 10);

  const utcExpiry = Date.UTC(year, month, day);
  const utcToday = Date.UTC(todayYear, todayMonth, todayDay);

  const diffMs = utcExpiry - utcToday;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Evaluates whether a document has reached one of the standard Kudumba Vault notification milestones:
 * - 60 days before
 * - 30 days before
 * - 7 days before
 * - 1 day before
 * - 0 days (expiry date)
 * - Post-expiry weekly recurring reminders (-7, -14, -21...)
 */
export function evaluateMilestone(daysRemaining: number): MilestoneEvaluation {
  if (daysRemaining === 60) {
    return { shouldNotify: true, milestone: 60, urgency: 'NOTICE' };
  }
  if (daysRemaining === 30) {
    return { shouldNotify: true, milestone: 30, urgency: 'NOTICE' };
  }
  if (daysRemaining === 7) {
    return { shouldNotify: true, milestone: 7, urgency: 'WARNING' };
  }
  if (daysRemaining === 1) {
    return { shouldNotify: true, milestone: 1, urgency: 'CRITICAL' };
  }
  if (daysRemaining === 0) {
    return { shouldNotify: true, milestone: 0, urgency: 'CRITICAL' };
  }
  if (daysRemaining < 0 && daysRemaining % 7 === 0) {
    return { shouldNotify: true, milestone: daysRemaining, urgency: 'CRITICAL' };
  }

  return { shouldNotify: false, milestone: daysRemaining, urgency: 'NOTICE' };
}

export interface ExpiryJobOptions {
  docs: VaultDocumentItem[];
  members: HouseholdMemberItem[];
  tracker: NotificationTracker;
  referenceDate?: Date;
  timeZone?: string;
  defaultRecipientEmail?: string;
  baseUrl?: string;
  batchSize?: number;
}

export interface ExpiryJobReport {
  evaluatedCount: number;
  eligibleMilestonesCount: number;
  claimedCount: number;
  sentCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  details: Array<{
    documentId: string;
    docTitle: string;
    recipientEmail: string;
    milestone: number;
    status: 'sent' | 'skipped_duplicate' | 'failed' | 'skipped_no_email';
    error?: string;
  }>;
}

/**
 * Executes a single run of the automated document expiry notification engine.
 * Reads documents, matches authorized family recipients, claims atomically, and dispatches via Gmail SMTP.
 */
export async function runDocumentExpiryJob(options: ExpiryJobOptions): Promise<ExpiryJobReport> {
  const {
    docs,
    members,
    tracker,
    referenceDate,
    timeZone = 'Asia/Kolkata',
    defaultRecipientEmail = process.env.ALERT_DEFAULT_RECIPIENT || '',
    baseUrl = process.env.APP_URL || 'http://localhost:3000',
    batchSize = 25,
  } = options;

  const report: ExpiryJobReport = {
    evaluatedCount: 0,
    eligibleMilestonesCount: 0,
    claimedCount: 0,
    sentCount: 0,
    skippedDuplicateCount: 0,
    failedCount: 0,
    details: [],
  };

  // Build member lookup by ID
  const memberMap = new Map<string, HouseholdMemberItem>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // Filter out invalid/deleted/archived documents
  const activeDocs = docs.filter((d) => d && d.id && d.expiryDate && d.expiryDate.trim());

  // Process in manageable batches to prevent event loop starvation
  for (let i = 0; i < activeDocs.length; i += batchSize) {
    const batch = activeDocs.slice(i, i + batchSize);

    for (const doc of batch) {
      report.evaluatedCount++;

      const days = calculateDaysRemainingInTimezone(doc.expiryDate, referenceDate, timeZone);
      if (days === null) continue;

      const evalResult = evaluateMilestone(days);
      if (!evalResult.shouldNotify) {
        continue;
      }

      report.eligibleMilestonesCount++;

      // Identify the authorized family recipient
      const member = doc.memberId ? memberMap.get(doc.memberId) : undefined;
      const recipientName = member ? member.nameEn : doc.ownerEn || 'Family Member';
      const targetEmail = (doc.ownerEmail || member?.email || defaultRecipientEmail || '').trim();

      // Validate email format
      const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail);
      if (!isEmailValid) {
        report.details.push({
          documentId: doc.id,
          docTitle: doc.titleEn,
          recipientEmail: targetEmail,
          milestone: evalResult.milestone,
          status: 'skipped_no_email',
          error: 'No valid recipient email configured.',
        });
        continue;
      }

      // Atomic Deduplication Claim
      const claimed = tracker.claimForDispatch(
        doc.id,
        doc.ownerId || doc.memberId || 'household-admin',
        targetEmail,
        evalResult.milestone,
        doc.expiryDate
      );

      if (!claimed) {
        report.skippedDuplicateCount++;
        report.details.push({
          documentId: doc.id,
          docTitle: doc.titleEn,
          recipientEmail: targetEmail,
          milestone: evalResult.milestone,
          status: 'skipped_duplicate',
        });
        continue;
      }

      report.claimedCount++;

      // Format clean, masked email content
      const maskedNumber = maskSensitiveNumber(doc.docNumber, doc.docTypeCode);
      const emailContent = buildExpiryEmailContent({
        recipientName,
        documentTitle: doc.titleEn,
        documentCategory: doc.categoryEn || doc.categoryId || 'Document',
        authorityName: doc.authorityEn,
        maskedNumber,
        expiryDateStr: doc.expiryDate,
        daysRemaining: days,
        milestone: evalResult.milestone,
        preferredLang: 'ml', // Kudumba Vault defaults to bilingual with Malayalam emphasis
        vaultUrl: `${baseUrl}`,
      });

      // Dispatch via Gmail SMTP with inline CID attachments:
      // 1. Header Left & Footer Left: House Vault Logo (cid:emailHeaderHouse)
      // 2. Hero Body Right: 3D Robot Mascot (cid:emailMascotAlert)
      // 3. Alert Callout Right: 3D Calendar Alert (cid:emailCalendar)
      const attachments = getEmailAttachments();

      const sendResult = await sendEmail({
        to: targetEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        attachments,
      });

      if (sendResult.success) {
        report.sentCount++;
        tracker.markSent(
          doc.id,
          targetEmail,
          evalResult.milestone,
          doc.expiryDate,
          sendResult.messageId
        );
        report.details.push({
          documentId: doc.id,
          docTitle: doc.titleEn,
          recipientEmail: targetEmail,
          milestone: evalResult.milestone,
          status: 'sent',
        });
      } else {
        report.failedCount++;
        tracker.markFailed(
          doc.id,
          targetEmail,
          evalResult.milestone,
          doc.expiryDate,
          sendResult.error || 'Unknown send failure'
        );
        report.details.push({
          documentId: doc.id,
          docTitle: doc.titleEn,
          recipientEmail: targetEmail,
          milestone: evalResult.milestone,
          status: 'failed',
          error: sendResult.error,
        });
      }
    }
  }

  return report;
}
