import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  transactionReference: string;
  userId: mongoose.Types.ObjectId;
  subscriptionId?: mongoose.Types.ObjectId;
  amountInr: number;
  gatewayFeeInr: number;
  taxInr: number;
  netAmountInr: number;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  paymentGateway: 'RAZORPAY' | 'STRIPE' | 'MANUAL';
  gatewayPaymentId?: string;
  gatewayOrderId?: string;
  refundReference?: string;
  refundedAmountInr?: number;
  failureReason?: string;
  reconciled: boolean;
  reconciledAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    transactionReference: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', index: true },
    amountInr: { type: Number, required: true },
    gatewayFeeInr: { type: Number, default: 0 },
    taxInr: { type: Number, default: 0 },
    netAmountInr: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    paymentGateway: {
      type: String,
      required: true,
      enum: ['RAZORPAY', 'STRIPE', 'MANUAL'],
      default: 'MANUAL',
    },
    gatewayPaymentId: { type: String, trim: true, index: true },
    gatewayOrderId: { type: String, trim: true, index: true },
    refundReference: { type: String, trim: true },
    refundedAmountInr: { type: Number, default: 0 },
    failureReason: { type: String, trim: true },
    reconciled: { type: Boolean, default: false, index: true },
    reconciledAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ createdAt: -1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
