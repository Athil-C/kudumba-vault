import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type BillingDuration = 'monthly' | 'quarterly' | 'yearly';

export interface IBillingAddressSnapshot {
  fullName: string;
  houseBuilding: string;
  streetLocality: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
}

export interface IPaymentRequest extends Document {
  userId: Types.ObjectId;
  subscriptionPlanId: string;
  planNameSnapshot: string;
  billingDuration: BillingDuration;
  durationMonths: number;
  monthlyRate: number;
  baseTotal: number;
  planSavings: number;
  couponCode?: string;
  couponDiscount: number;
  payableAmount: number;
  currency: string;
  utrNumber?: string;
  paymentDate?: Date;
  proofFilePath?: string;
  proofOriginalName?: string;
  proofMimeType?: string;
  proofFileSize?: number;
  billingAddressSnapshot: IBillingAddressSnapshot;
  remarks?: string;
  status: PaymentRequestStatus;
  rejectionReason?: string;
  adminVerifiedBy?: Types.ObjectId;
  adminEmail?: string;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BillingAddressSnapshotSchema = new Schema<IBillingAddressSnapshot>(
  {
    fullName: { type: String, required: true, trim: true },
    houseBuilding: { type: String, required: true, trim: true },
    streetLocality: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    postalCode: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const PaymentRequestSchema = new Schema<IPaymentRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscriptionPlanId: { type: String, required: true, trim: true },
    planNameSnapshot: { type: String, required: true, trim: true },
    billingDuration: {
      type: String,
      required: true,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    durationMonths: { type: Number, required: true, default: 1 },
    monthlyRate: { type: Number, required: true },
    baseTotal: { type: Number, required: true },
    planSavings: { type: Number, default: 0 },
    couponCode: { type: String, trim: true },
    couponDiscount: { type: Number, default: 0 },
    payableAmount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    utrNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },
    paymentDate: { type: Date },
    proofFilePath: { type: String, trim: true },
    proofOriginalName: { type: String, trim: true },
    proofMimeType: { type: String, trim: true },
    proofFileSize: { type: Number },
    billingAddressSnapshot: { type: BillingAddressSnapshotSchema, required: true },
    remarks: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    rejectionReason: { type: String, trim: true },
    adminVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    adminEmail: { type: String, trim: true },
    verifiedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

PaymentRequestSchema.index({ userId: 1, status: 1 });
PaymentRequestSchema.index({ createdAt: -1 });

export const PaymentRequest =
  (mongoose.models.PaymentRequest as mongoose.Model<IPaymentRequest>) ||
  mongoose.model<IPaymentRequest>('PaymentRequest', PaymentRequestSchema);

// In-memory mock store for unit testing when MongoDB is unavailable
const mockPaymentRequests = new Map<string, any>();

export function clearMockPaymentRequests(): void {
  mockPaymentRequests.clear();
}

export function getMockPaymentRequests(): Map<string, any> {
  return mockPaymentRequests;
}
