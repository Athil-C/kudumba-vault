import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPaymentHistory extends Document {
  userId: Types.ObjectId;
  paymentRequestId: Types.ObjectId;
  amount: number;
  currency: string;
  utrNumber: string;
  planId: string;
  planNameSnapshot: string;
  billingDuration: string;
  durationMonths: number;
  paymentDate: Date;
  verificationStatus: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  approvedBy?: Types.ObjectId;
  approvedByEmail?: string;
  approvedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentHistorySchema = new Schema<IPaymentHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paymentRequestId: { type: Schema.Types.ObjectId, ref: 'PaymentRequest', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    utrNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    planId: { type: String, required: true, trim: true },
    planNameSnapshot: { type: String, required: true, trim: true },
    billingDuration: { type: String, required: true },
    durationMonths: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    verificationStatus: {
      type: String,
      required: true,
      enum: ['APPROVED', 'REJECTED'],
      default: 'APPROVED',
      index: true,
    },
    rejectionReason: { type: String, trim: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByEmail: { type: String, trim: true },
    approvedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
  }
);

PaymentHistorySchema.index({ userId: 1, createdAt: -1 });

export const PaymentHistory =
  (mongoose.models.PaymentHistory as mongoose.Model<IPaymentHistory>) ||
  mongoose.model<IPaymentHistory>('PaymentHistory', PaymentHistorySchema);

// In-memory mock store for unit tests
const mockPaymentHistories = new Map<string, any>();

export function clearMockPaymentHistories(): void {
  mockPaymentHistories.clear();
}

export function getMockPaymentHistories(): Map<string, any> {
  return mockPaymentHistories;
}
