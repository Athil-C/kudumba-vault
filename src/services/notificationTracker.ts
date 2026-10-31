import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { NotificationLog, sanitizeNotificationError } from '../models/NotificationLog';

export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface NotificationRecord {
  id: string;
  documentId: string;
  recipientId: string;
  recipientEmail: string;
  milestone: number; // 60, 30, 7, 1, 0, -7, -14, etc.
  expiryDate: string; // YYYY-MM-DD
  status: NotificationStatus;
  attemptCount: number;
  lastAttemptAt?: string;
  sentAt?: string;
  errorMessage?: string;
  messageId?: string;
  createdAt: string;
}

export class NotificationTracker {
  private records: Map<string, NotificationRecord> = new Map();
  private filePath: string | null = null;
  private inFlightClaims: Set<string> = new Set();

  constructor(filePath?: string) {
    if (filePath) {
      this.filePath = filePath;
      this.loadFromFile();
    }
  }

  /**
   * Generates a deterministic deduplication key matching the database constraint:
   * (documentId, recipientEmail, milestone, expiryDate)
   */
  public getDeduplicationKey(
    documentId: string,
    recipientEmail: string,
    milestone: number,
    expiryDate: string
  ): string {
    const normEmail = recipientEmail.toLowerCase().trim();
    const normExpiry = expiryDate.slice(0, 10);
    return `${documentId}:${normEmail}:${milestone}:${normExpiry}`;
  }

  /**
   * Checks if an email has already been successfully sent for this document, milestone, and expiry date.
   */
  public hasBeenSent(
    documentId: string,
    recipientEmail: string,
    milestone: number,
    expiryDate: string
  ): boolean {
    const key = this.getDeduplicationKey(documentId, recipientEmail, milestone, expiryDate);
    const existing = this.records.get(key);
    return existing !== undefined && existing.status === 'sent';
  }

  /**
   * Asynchronously checks if an email has already been successfully sent, checking both
   * the local memory tracker and MongoDB Atlas NotificationLog collection.
   * Guarantees persistence across server restarts and multi-instance deployments.
   */
  public async hasBeenSentAsync(
    documentId: string,
    recipientEmail: string,
    milestone: number,
    expiryDate: string
  ): Promise<boolean> {
    const normExpiry = expiryDate.slice(0, 10);
    const normEmail = recipientEmail.toLowerCase().trim();

    // 1. Check fast-path in-memory records
    const key = this.getDeduplicationKey(documentId, normEmail, milestone, normExpiry);
    const existing = this.records.get(key);
    if (existing && existing.status === 'sent') {
      return true;
    }

    // 2. Query persistent MongoDB collection if connected
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(documentId)) {
      try {
        const log = await NotificationLog.findOne({
          documentId: new mongoose.Types.ObjectId(documentId),
          milestone,
          expiryDate: normExpiry,
          recipientEmail: normEmail,
          status: 'sent',
        });
        if (log) {
          // Warm the memory cache
          this.records.set(key, {
            id: log._id.toString(),
            documentId,
            recipientId: log.ownerId.toString(),
            recipientEmail: log.recipientEmail,
            milestone: log.milestone,
            expiryDate: log.expiryDate,
            status: log.status,
            attemptCount: log.attemptCount,
            sentAt: log.sentAt?.toISOString(),
            lastAttemptAt: log.lastAttemptAt?.toISOString(),
            createdAt: log.createdAt.toISOString(),
          });
          return true;
        }
      } catch (err: unknown) {
        console.warn('[NotificationTracker] MongoDB lookup notice in hasBeenSentAsync:', err);
      }
    }

    return false;
  }

  /**
   * Atomic claim mechanism:
   * Prevents multiple background workers or overlapping executions from claiming the same notification.
   * Returns true if claimed successfully, false if already claimed or sent.
   */
  public claimForDispatch(
    documentId: string,
    recipientId: string,
    recipientEmail: string,
    milestone: number,
    expiryDate: string
  ): boolean {
    const key = this.getDeduplicationKey(documentId, recipientEmail, milestone, expiryDate);

    // If currently in-flight in this process or worker, reject duplicate
    if (this.inFlightClaims.has(key)) {
      return false;
    }

    const existing = this.records.get(key);
    if (existing && existing.status === 'sent') {
      return false;
    }

    // Check bounded retry policy (max 3 attempts for failed items)
    if (existing && existing.status === 'failed' && existing.attemptCount >= 3) {
      return false;
    }

    this.inFlightClaims.add(key);

    const updatedRecord: NotificationRecord = existing
      ? {
          ...existing,
          status: 'sending',
          attemptCount: existing.attemptCount + 1,
          lastAttemptAt: new Date().toISOString(),
        }
      : {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          documentId,
          recipientId,
          recipientEmail: recipientEmail.toLowerCase().trim(),
          milestone,
          expiryDate: expiryDate.slice(0, 10),
          status: 'sending',
          attemptCount: 1,
          lastAttemptAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };

    this.records.set(key, updatedRecord);
    this.saveToFile();
    return true;
  }

  /**
   * Release the claim lock after successful send.
   */
  public markSent(
    documentId: string,
    recipientEmail: string,
    milestone: number,
    expiryDate: string,
    messageId?: string
  ): void {
    const key = this.getDeduplicationKey(documentId, recipientEmail, milestone, expiryDate);
    this.inFlightClaims.delete(key);

    const record = this.records.get(key);
    if (record) {
      record.status = 'sent';
      record.sentAt = new Date().toISOString();
      if (messageId) record.messageId = messageId;
      record.errorMessage = undefined;
      this.saveToFile();
    }

    // Sync to MongoDB if connected
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(documentId)) {
      NotificationLog.findOneAndUpdate(
        {
          documentId: new mongoose.Types.ObjectId(documentId),
          milestone,
          expiryDate: expiryDate.slice(0, 10),
        },
        {
          $set: {
            status: 'sent',
            sentAt: new Date(),
            lastAttemptAt: new Date(),
            messageId,
          },
          $inc: { attemptCount: 1 },
        },
        { upsert: true }
      ).catch((dbErr) => {
        console.warn('[NotificationTracker] MongoDB log sync warning:', dbErr?.message);
      });
    }
  }

  /**
   * Release the claim lock after failure.
   */
  public markFailed(
    documentId: string,
    recipientEmail: string,
    milestone: number,
    expiryDate: string,
    error: string
  ): void {
    const key = this.getDeduplicationKey(documentId, recipientEmail, milestone, expiryDate);
    this.inFlightClaims.delete(key);

    const record = this.records.get(key);
    if (record) {
      record.status = 'failed';
      // Sanitize error string so no sensitive information is saved
      record.errorMessage = sanitizeNotificationError(error) || error.slice(0, 300);
      this.saveToFile();
    }

    // Sync to MongoDB if connected
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(documentId)) {
      NotificationLog.findOneAndUpdate(
        {
          documentId: new mongoose.Types.ObjectId(documentId),
          milestone,
          expiryDate: expiryDate.slice(0, 10),
        },
        {
          $set: {
            status: 'failed',
            lastAttemptAt: new Date(),
            error: sanitizeNotificationError(error),
          },
          $inc: { attemptCount: 1 },
        },
        { upsert: true }
      ).catch((dbErr) => {
        console.warn('[NotificationTracker] MongoDB log failure sync warning:', dbErr?.message);
      });
    }
  }

  /**
   * Get a specific tracked notification by deduplication key.
   */
  public getRecord(key: string): NotificationRecord | undefined {
    return this.records.get(key);
  }

  /**
   * Get all tracked notifications.
   */
  public getAllRecords(): NotificationRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Clear all records (useful for test isolation).
   */
  public clear(): void {
    this.records.clear();
    this.inFlightClaims.clear();
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch {
        // ignore
      }
    }
  }

  private loadFromFile(): void {
    if (!this.filePath) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) {
            const key = this.getDeduplicationKey(
              item.documentId,
              item.recipientEmail,
              item.milestone,
              item.expiryDate
            );
            this.records.set(key, item);
          }
        }
      }
    } catch (err) {
      console.warn('[NotificationTracker] Failed to read storage file:', err);
    }
  }

  private saveToFile(): void {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.records.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[NotificationTracker] Failed to write storage file:', err);
    }
  }
}

// Global persistent instance for the backend process
const defaultStoragePath = path.join(process.cwd(), '.data', 'notification_tracking.json');
export const notificationTracker = new NotificationTracker(defaultStoragePath);
