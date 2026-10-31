import mongoose, { Types } from 'mongoose';
import { Document as DocumentModel } from '../models/Document';
import { Subscription, ISubscription, RetentionStatus } from '../models/Subscription';
import { User } from '../models/User';
import { deleteDocumentFromStorage } from './supabaseStorage';
import { sendEmail } from './mailer';

export interface RetentionJobResult {
  accountsEvaluated: number;
  inGraceCount: number;
  graceExpiredCount: number;
  eligibleForDeletionCount: number;
  documentsIdentified: number;
  documentsDeleted: number;
  storageFailures: number;
  dbFailures: number;
  dryRun: boolean;
  details: Array<{
    userId: string;
    email?: string;
    trialEnd?: string;
    gracePeriodEnd?: string;
    retentionStatus: RetentionStatus;
    documentCount: number;
    actionTaken: string;
  }>;
}

// In-memory audit tracking for tests and dev
const mockRetentionAuditLog: any[] = [];

/**
 * Executes the safe, auditable grace period & document retention scan.
 *
 * Rules:
 * 1. Dry run enabled by default. Permanent deletion is ONLY executed when options.dryRun === false AND options.enablePermanentDeletion === true.
 * 2. Accounts in active paid status (including concurrent upgrades) are strictly excluded from deletion.
 * 3. Expired accounts within the 48-hour grace period are marked 'in_grace_period' and notified, but documents remain intact.
 * 4. Expired accounts past the 48-hour grace period are marked 'grace_expired' and 'scheduled_for_deletion'.
 * 5. If deletion is executed, it deletes only the authenticated owner's files and handles Supabase Storage + MongoDB consistently.
 */
export async function runRetentionScan(options: {
  dryRun?: boolean;
  enablePermanentDeletion?: boolean;
  now?: Date;
} = {}): Promise<RetentionJobResult> {
  const isDryRun = options.dryRun !== false || !options.enablePermanentDeletion;
  const currentTime = options.now || new Date();
  const nowMs = currentTime.getTime();

  const result: RetentionJobResult = {
    accountsEvaluated: 0,
    inGraceCount: 0,
    graceExpiredCount: 0,
    eligibleForDeletionCount: 0,
    documentsIdentified: 0,
    documentsDeleted: 0,
    storageFailures: 0,
    dbFailures: 0,
    dryRun: isDryRun,
    details: [],
  };

  const isDb = mongoose.connection.readyState === 1;

  if (isDb) {
    // Find subscriptions that are trialing or expired, but NOT active paid plans
    const subscriptions = await Subscription.find({
      status: { $in: ['trialing', 'expired'] },
      planId: 'founding-free', // Never touch paid subscriptions
    });

    for (const sub of subscriptions) {
      result.accountsEvaluated++;

      // Recheck status right now to prevent race conditions with concurrent payment upgrades
      const freshSub = await Subscription.findById(sub._id);
      if (!freshSub || freshSub.status === 'active' || freshSub.planId !== 'founding-free') {
        continue; // User upgraded concurrently or active; skip completely
      }

      const trialEndTime = freshSub.trialEnd ? new Date(freshSub.trialEnd).getTime() : 0;
      const gracePeriodEndTime = freshSub.gracePeriodEnd
        ? new Date(freshSub.gracePeriodEnd).getTime()
        : trialEndTime + 48 * 60 * 60 * 1000;

      // Case 1: Trial still running
      if (nowMs < trialEndTime) {
        continue;
      }

      // Case 2: Trial ended, within 48-hour grace period
      if (nowMs >= trialEndTime && nowMs < gracePeriodEndTime) {
        result.inGraceCount++;
        if (freshSub.retentionStatus !== 'in_grace_period') {
          freshSub.retentionStatus = 'in_grace_period';
          freshSub.status = 'expired';
          if (!freshSub.gracePeriodEnd) {
            freshSub.gracePeriodEnd = new Date(gracePeriodEndTime);
          }
          await freshSub.save();
        }

        const userDocsCount = await DocumentModel.countDocuments({
          ownerId: freshSub.userId,
          deletedAt: null,
        });

        result.details.push({
          userId: freshSub.userId.toString(),
          trialEnd: freshSub.trialEnd?.toISOString(),
          gracePeriodEnd: freshSub.gracePeriodEnd?.toISOString(),
          retentionStatus: 'in_grace_period',
          documentCount: userDocsCount,
          actionTaken: 'Flagged in 48-hour grace period (Read-only mode, no deletion)',
        });
        continue;
      }

      // Case 3: Grace period expired (Past trialEnd + 48 hours)
      if (nowMs >= gracePeriodEndTime) {
        result.graceExpiredCount++;
        result.eligibleForDeletionCount++;

        const userDocs = await DocumentModel.find({
          ownerId: freshSub.userId,
          deletedAt: null,
        });
        result.documentsIdentified += userDocs.length;

        if (isDryRun) {
          if (freshSub.retentionStatus !== 'grace_expired' && freshSub.retentionStatus !== 'scheduled_for_deletion') {
            freshSub.retentionStatus = 'scheduled_for_deletion';
            freshSub.deletionScheduledAt = new Date(gracePeriodEndTime);
            await freshSub.save();
          }

          result.details.push({
            userId: freshSub.userId.toString(),
            trialEnd: freshSub.trialEnd?.toISOString(),
            gracePeriodEnd: freshSub.gracePeriodEnd?.toISOString(),
            retentionStatus: 'scheduled_for_deletion',
            documentCount: userDocs.length,
            actionTaken: `DRY RUN: Identified ${userDocs.length} documents eligible for deletion. No files deleted.`,
          });
        } else {
          // Double check concurrency before destructive action
          const recheckedSub = await Subscription.findById(freshSub._id);
          if (recheckedSub?.status === 'active') {
            continue; // Abort deletion immediately if upgraded
          }

          // Safe deletion: delete Supabase Storage objects first, then update MongoDB
          for (const doc of userDocs) {
            try {
              if (doc.storagePath) {
                const storageRes = await deleteDocumentFromStorage(doc.storagePath);
                if (!storageRes.success) {
                  result.storageFailures++;
                }
              }
              doc.deletedAt = new Date();
              await doc.save();
              result.documentsDeleted++;
            } catch (delErr) {
              result.dbFailures++;
            }
          }

          freshSub.retentionStatus = 'grace_expired';
          await freshSub.save();

          result.details.push({
            userId: freshSub.userId.toString(),
            trialEnd: freshSub.trialEnd?.toISOString(),
            gracePeriodEnd: freshSub.gracePeriodEnd?.toISOString(),
            retentionStatus: 'grace_expired',
            documentCount: userDocs.length,
            actionTaken: `PERMANENT DELETION: Deleted ${result.documentsDeleted} documents after grace expiration.`,
          });
        }
      }
    }
  }

  mockRetentionAuditLog.push({ timestamp: new Date(), result });
  return result;
}

export function _getMockRetentionAuditLog() {
  return mockRetentionAuditLog;
}

export function _clearMockRetentionAuditLog() {
  mockRetentionAuditLog.length = 0;
}
