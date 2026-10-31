import cron, { ScheduledTask } from 'node-cron';
import mongoose, { Types } from 'mongoose';
import { INITIAL_DOCS, INITIAL_MEMBERS } from '../data/initialVaultData';
import { notificationTracker } from './notificationTracker';
import {
  runDocumentExpiryJob,
  ExpiryJobReport,
  checkAndDispatchDocumentExpiryNotification,
} from './expiryDetector';
import { DocumentModel } from '../models/Document';
import { UserSettings } from '../models/UserSettings';
import { VaultDocumentItem, HouseholdMemberItem } from '../types/vault';
import { processExpiredTrialsBatch, TrialBatchResult } from './subscriptionService';

let scheduledTask: ScheduledTask | null = null;
let trialTask: ScheduledTask | null = null;
let isJobRunning = false;
let isTrialJobRunning = false;

/**
 * Initializes the automated document expiry background scheduler.
 * Runs every day at 09:00 AM Indian Standard Time (Asia/Kolkata).
 * Also performs an initial catch-up scan on startup to handle missed runs.
 * Prevents overlapping executions using a job running lock.
 */
export function startExpiryScheduler(): ScheduledTask {
  if (scheduledTask) {
    return scheduledTask;
  }

  // 9:00 AM Asia/Kolkata: 0 9 * * *
  const cronExpression = '0 9 * * *';

  scheduledTask = cron.schedule(
    cronExpression,
    async () => {
      if (isJobRunning) {
        console.warn('[Scheduler] Previous expiry check job is still active; skipping overlapping cycle.');
        return;
      }

      isJobRunning = true;
      console.log('[Scheduler] Starting 9:00 AM IST automated document expiry scan...');

      try {
        const report = await runSchedulerCycle();
        console.log(
          `[Scheduler] Expiry scan finished. Evaluated: ${report.evaluatedCount}, Sent: ${report.sentCount}, Skipped: ${report.skippedDuplicateCount}, Failed: ${report.failedCount}`
        );
      } catch (err) {
        console.error('[Scheduler] Unexpected error during automated expiry scan:', err);
      } finally {
        isJobRunning = false;
      }
    },
    {
      timezone: 'Asia/Kolkata',
      noOverlap: true,
    }
  );

  // Hourly automated trial expiration & milestone reminder background job: 0 * * * *
  trialTask = cron.schedule(
    '0 * * * *',
    async () => {
      if (isTrialJobRunning) {
        console.warn('[Scheduler] Previous trial expiration batch is still active; skipping overlapping cycle.');
        return;
      }

      isTrialJobRunning = true;
      console.log('[Scheduler] Starting hourly automated trial expiration and reminder scan...');

      try {
        const trialReport = await processExpiredTrialsBatch();
        console.log(
          `[Scheduler] Hourly trial scan finished. Evaluated: ${trialReport.evaluatedCount}, Expired: ${trialReport.expiredCount}, Reminders: ${trialReport.remindersSent}, Notified: ${trialReport.expirationsNotified}`
        );
      } catch (trialErr) {
        console.error('[Scheduler] Unexpected error during automated trial expiration scan:', trialErr);
      } finally {
        isTrialJobRunning = false;
      }
    },
    {
      timezone: 'UTC',
      noOverlap: true,
    }
  );

  console.log('[Scheduler] Automated document expiry background job registered (Daily at 09:00 AM Asia/Kolkata).');
  console.log('[Scheduler] Automated trial expiration background job registered (Hourly at minute 0 UTC).');

  // Startup catch-up: Run an initial scan to handle missed runs, newly due documents and expired trials
  if (process.env.NODE_ENV !== 'test') {
    setTimeout(async () => {
      try {
        console.log('[Scheduler] Running initial startup expiry catch-up scan...');
        const report = await runSchedulerCycle();
        console.log(
          `[Scheduler] Startup catch-up scan complete: ${report.evaluatedCount} evaluated, ${report.sentCount} sent, ${report.skippedDuplicateCount} duplicate-skipped.`
        );
      } catch (e) {
        console.warn('[Scheduler] Startup catch-up scan error:', e);
      }

      try {
        console.log('[Scheduler] Running initial startup trial expiration catch-up scan...');
        const trialReport = await processExpiredTrialsBatch();
        console.log(
          `[Scheduler] Startup trial catch-up complete: ${trialReport.evaluatedCount} evaluated, ${trialReport.expiredCount} expired, ${trialReport.remindersSent} reminders, ${trialReport.expirationsNotified} notified.`
        );
      } catch (trialErr) {
        console.warn('[Scheduler] Startup trial expiration catch-up error:', trialErr);
      }
    }, 5000);
  }

  return scheduledTask;
}

/**
 * Executes a scheduler cycle immediately (used for startup catch-up, admin trigger, or tests).
 * Queries MongoDB Atlas when connected; falls back cleanly to initial vault data in test/offline dev.
 */
export async function runSchedulerCycle(options?: {
  referenceDate?: Date;
  timeZone?: string;
  reminderWindowDays?: number;
}): Promise<ExpiryJobReport> {
  const isDb = mongoose.connection.readyState === 1;
  const timeZone = options?.timeZone || 'Asia/Kolkata';
  const reminderWindowDays =
    options?.reminderWindowDays ||
    parseInt(process.env.EXPIRY_REMINDER_WINDOW_DAYS || '30', 10);

  const report: ExpiryJobReport = {
    evaluatedCount: 0,
    eligibleMilestonesCount: 0,
    claimedCount: 0,
    sentCount: 0,
    skippedDuplicateCount: 0,
    failedCount: 0,
    details: [],
  };

  if (isDb) {
    try {
      const docs = await DocumentModel.find({
        deletedAt: null,
        expiryDate: { $ne: null },
      }).populate<{ ownerId: { _id: Types.ObjectId; name: string; email: string } }>('ownerId');

      for (const d of docs) {
        report.evaluatedCount++;
        const owner = d.ownerId as any;
        const ownerEmail = (owner?.email || '').trim().toLowerCase();
        const docId = d._id.toString();
        const expiryDateStr = d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : '';

        if (!expiryDateStr) continue;

        if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
          report.details.push({
            documentId: docId,
            docTitle: d.title,
            recipientEmail: ownerEmail,
            milestone: 0,
            status: 'skipped_no_email',
            error: 'Document owner has no valid account email.',
          });
          continue;
        }

        let ownerSettings: any = null;
        if (isDb && owner?._id) {
          try {
            ownerSettings = await UserSettings.findOne({ userId: owner._id });
          } catch {}
        }

        const res = await checkAndDispatchDocumentExpiryNotification({
          document: {
            id: docId,
            title: d.title,
            category: d.category,
            categoryEn: d.category,
            docNumber: d.docNumber,
            authorityEn: d.authorityEn,
            expiryDate: d.expiryDate,
            ownerNameEn: owner?.name,
            memberId: d.memberId,
          },
          user: {
            id: owner?._id?.toString() || docId,
            email: ownerEmail,
            name: owner?.name,
          },
          notificationPreferences: ownerSettings?.notificationPreferences,
          reason: 'manual',
          referenceDate: options?.referenceDate,
          timeZone,
          reminderWindowDays,
        });

        if (res.status === 'sent') {
          report.eligibleMilestonesCount++;
          report.claimedCount++;
          report.sentCount++;
          report.details.push({
            documentId: docId,
            docTitle: d.title,
            recipientEmail: ownerEmail,
            milestone: res.milestone || 0,
            status: 'sent',
          });
        } else if (res.status === 'skipped_duplicate') {
          report.eligibleMilestonesCount++;
          report.skippedDuplicateCount++;
          report.details.push({
            documentId: docId,
            docTitle: d.title,
            recipientEmail: ownerEmail,
            milestone: res.milestone || 0,
            status: 'skipped_duplicate',
          });
        } else if (res.status === 'failed') {
          report.eligibleMilestonesCount++;
          report.claimedCount++;
          report.failedCount++;
          report.details.push({
            documentId: docId,
            docTitle: d.title,
            recipientEmail: ownerEmail,
            milestone: res.milestone || 0,
            status: 'failed',
            error: res.error,
          });
        }
      }

      return report;
    } catch (err: unknown) {
      console.warn('[Scheduler] MongoDB query failed during expiry cycle, falling back to initial data:', err);
    }
  }

  // Fallback for test / offline development
  return await runDocumentExpiryJob({
    docs: INITIAL_DOCS,
    members: INITIAL_MEMBERS,
    tracker: notificationTracker,
    referenceDate: options?.referenceDate,
    timeZone,
  });
}

/**
 * Executes a trial expiration cycle immediately (for tests, admin trigger, or server restart).
 */
export async function runTrialExpirationCycle(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<TrialBatchResult> {
  return await processExpiredTrialsBatch(options);
}

/**
 * Stops the scheduler (for graceful shutdown or test teardown).
 */
export function stopExpiryScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (trialTask) {
    trialTask.stop();
    trialTask = null;
  }
}
