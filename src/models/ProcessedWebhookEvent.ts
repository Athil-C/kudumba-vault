import mongoose, { Schema, Document } from 'mongoose';

export interface IProcessedWebhookEvent extends Document {
  eventId: string;
  gateway: 'RAZORPAY' | 'STRIPE';
  eventType: string;
  paymentId?: string;
  status: 'PROCESSED' | 'FAILED';
  processedAt: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ProcessedWebhookEventSchema = new Schema<IProcessedWebhookEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    gateway: {
      type: String,
      required: true,
      enum: ['RAZORPAY', 'STRIPE'],
      default: 'RAZORPAY',
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    paymentId: {
      type: String,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['PROCESSED', 'FAILED'],
      default: 'PROCESSED',
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically prune old idempotency logs after 90 days
ProcessedWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ProcessedWebhookEvent =
  (mongoose.models.ProcessedWebhookEvent as mongoose.Model<IProcessedWebhookEvent>) ||
  mongoose.model<IProcessedWebhookEvent>('ProcessedWebhookEvent', ProcessedWebhookEventSchema);

// In-memory mock store for unit testing & development sandbox
const mockProcessedWebhooks = new Map<string, any>();

export function clearMockProcessedWebhooks(): void {
  mockProcessedWebhooks.clear();
}

export function getMockProcessedWebhooks(): Map<string, any> {
  return mockProcessedWebhooks;
}
