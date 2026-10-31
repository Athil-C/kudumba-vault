import mongoose, { Schema, Document, Types } from 'mongoose';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'pending_payment';

export type RetentionStatus =
  | 'active'
  | 'trial_active'
  | 'in_grace_period'
  | 'grace_expired'
  | 'scheduled_for_deletion'
  | 'retained_paid';

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  planId: string;
  planName: string;
  maxFamilyMembers?: number;
  status: SubscriptionStatus;
  priceInr: number;
  cadence: 'FREE' | 'MONTHLY' | 'ANNUAL';
  trialStart?: Date;
  trialEnd?: Date;
  trialConsumed: boolean; // Immutable flag: once a user has ever claimed a trial, this remains true forever
  gracePeriodEnd?: Date;
  retentionStatus?: RetentionStatus;
  deletionScheduledAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd?: Date;
  cancelledAt?: Date;
  cancelAtPeriodEnd: boolean;
  cancellationMode?: 'END_OF_PERIOD' | 'IMMEDIATE';
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledByEmail?: string;
  cancellationRequestedAt?: Date;
  previousStatus?: string;
  isSimulatedDev: boolean; // Flag to isolate local development simulations from real billing
  // Historical fields preserved for database auditing and backwards-compatibility
  razorpaySubscriptionId?: string;
  razorpayPlanId?: string;
  razorpayCustomerId?: string;
  lastPaymentId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
    planId: {
      type: String,
      required: true,
      default: 'founding-free',
    },
    planName: { type: String, required: true, default: 'Founding Household (Free Trial / V1 Launch)' },
    maxFamilyMembers: { type: Number, default: 5 },
    status: {
      type: String,
      required: true,
      enum: ['trialing', 'active', 'past_due', 'canceled', 'expired', 'pending_payment'],
      default: 'trialing',
      index: true,
    },
    priceInr: { type: Number, required: true, default: 0 },
    cadence: {
      type: String,
      required: true,
      enum: ['FREE', 'MONTHLY', 'ANNUAL'],
      default: 'FREE',
    },
    trialStart: { type: Date },
    trialEnd: { type: Date, index: true },
    trialConsumed: { type: Boolean, default: true, index: true },
    gracePeriodEnd: { type: Date, index: true },
    retentionStatus: {
      type: String,
      enum: ['active', 'trial_active', 'in_grace_period', 'grace_expired', 'scheduled_for_deletion', 'retained_paid'],
      default: 'trial_active',
      index: true,
    },
    deletionScheduledAt: { type: Date, index: true },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date },
    cancelledAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancellationMode: { type: String, enum: ['END_OF_PERIOD', 'IMMEDIATE'] },
    cancellationReason: { type: String, trim: true },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledByEmail: { type: String, trim: true },
    cancellationRequestedAt: { type: Date },
    previousStatus: { type: String },
    isSimulatedDev: { type: Boolean, default: false, index: true },
    // Historical fields preserved without active indexing
    razorpaySubscriptionId: { type: String },
    razorpayPlanId: { type: String },
    razorpayCustomerId: { type: String },
    lastPaymentId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

SubscriptionSchema.index({ status: 1, trialEnd: 1 });

export const Subscription = (mongoose.models.Subscription as mongoose.Model<ISubscription>) ||
  mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
