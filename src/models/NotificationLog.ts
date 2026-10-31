import mongoose, { Model, Schema, Types } from 'mongoose';

export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface INotificationLog {
  ownerId: Types.ObjectId;
  documentId: Types.ObjectId;
  milestone: number; // 60, 30, 7, 1, 0, or negative overdue (-7, -14, etc.)
  expiryDate: string; // YYYY-MM-DD target date string for atomic milestone anchoring
  recipientEmail: string;
  status: NotificationStatus;
  attemptCount: number;
  lastAttemptAt?: Date;
  sentAt?: Date;
  messageId?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationLogMethods {
  markSent(messageId?: string): Promise<void>;
  markFailed(errorMessage: string): Promise<void>;
}

export type NotificationLogModelType = Model<
  INotificationLog,
  {},
  INotificationLogMethods
>;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strips SMTP credentials, auth tokens, or passwords from error strings before DB persistence.
 */
export function sanitizeNotificationError(rawError?: string): string | undefined {
  if (!rawError) return undefined;
  return rawError
    .replace(/(password|passwd|pass|auth|token|secret)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/[a-zA-Z0-9_\-]{20,}/g, (match) => {
      // If it looks like a long hash, API token, or key, redact middle characters
      if (match.length > 30) {
        return `${match.slice(0, 4)}...[REDACTED]...${match.slice(-4)}`;
      }
      return match;
    })
    .slice(0, 500); // Bounded error length
}

const NotificationLogSchema = new Schema<
  INotificationLog,
  NotificationLogModelType,
  INotificationLogMethods
>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required.'],
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: [true, 'Document ID is required.'],
      index: true,
    },
    milestone: {
      type: Number,
      required: [true, 'Notification milestone is required.'],
    },
    expiryDate: {
      type: String,
      required: [true, 'Expiry date milestone anchor is required.'],
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be in YYYY-MM-DD format.'],
    },
    recipientEmail: {
      type: String,
      required: [true, 'Recipient email is required.'],
      trim: true,
      lowercase: true,
      match: [emailRegex, 'Invalid recipient email format.'],
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'sending', 'sent', 'failed'],
        message: 'Invalid status: {VALUE}',
      },
      default: 'pending',
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: [0, 'Attempt count cannot be negative.'],
    },
    lastAttemptAt: {
      type: Date,
      default: undefined,
    },
    sentAt: {
      type: Date,
      default: undefined,
    },
    messageId: {
      type: String,
      trim: true,
      default: undefined,
    },
    error: {
      type: String,
      trim: true,
      maxlength: [1000, 'Error string cannot exceed 1000 characters.'],
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.__v;
        copy.id = ret._id?.toString();
        return copy;
      },
    },
    toObject: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.__v;
        copy.id = ret._id?.toString();
        return copy;
      },
    },
  }
);

/**
 * Unique Idempotency Compound Index:
 * Guarantees that only ONE notification record exists for a specific
 * (document, owner, milestone, expiryDate) combination.
 *
 * Expiry Date Rollover Behavior:
 * When a document is renewed (expiryDate changes), the new expiry date enables
 * a brand-new set of reminder milestones without conflicting with past history.
 */
NotificationLogSchema.index(
  { documentId: 1, ownerId: 1, milestone: 1, expiryDate: 1 },
  { unique: true }
);

// Compound Index for fast scheduler querying and recent logs
NotificationLogSchema.index({ ownerId: 1, createdAt: -1 });
NotificationLogSchema.index({ status: 1, attemptCount: 1 });

NotificationLogSchema.methods.markSent = async function (messageId?: string): Promise<void> {
  this.status = 'sent';
  this.sentAt = new Date();
  this.lastAttemptAt = new Date();
  this.attemptCount = (this.attemptCount || 0) + 1;
  this.messageId = messageId;
  this.error = undefined;
  await this.save();
};

NotificationLogSchema.methods.markFailed = async function (errorMessage: string): Promise<void> {
  this.status = 'failed';
  this.lastAttemptAt = new Date();
  this.attemptCount = (this.attemptCount || 0) + 1;
  this.error = sanitizeNotificationError(errorMessage);
  await this.save();
};

export function isDuplicateNotificationError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (errObj.code === 11000) {
      return true;
    }
  }
  return false;
}

export const NotificationLog: NotificationLogModelType =
  (mongoose.models.NotificationLog as NotificationLogModelType) ||
  mongoose.model<INotificationLog, NotificationLogModelType>(
    'NotificationLog',
    NotificationLogSchema
  );
