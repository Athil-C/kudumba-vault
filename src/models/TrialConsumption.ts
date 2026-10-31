import mongoose, { Schema, Document } from 'mongoose';

export interface ITrialConsumption extends Document {
  email: string;
  userId?: mongoose.Types.ObjectId;
  consumedAt: Date;
  trialDurationDays: number;
  reason: 'verified_signup' | 'trial_started' | 'migration';
  createdAt: Date;
  updatedAt: Date;
}

const TrialConsumptionSchema = new Schema<ITrialConsumption>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    consumedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    trialDurationDays: {
      type: Number,
      default: 3,
      required: true,
    },
    reason: {
      type: String,
      enum: ['verified_signup', 'trial_started', 'migration'],
      default: 'verified_signup',
    },
  },
  {
    timestamps: true,
  }
);

export const TrialConsumption =
  (mongoose.models.TrialConsumption as mongoose.Model<ITrialConsumption>) ||
  mongoose.model<ITrialConsumption>('TrialConsumption', TrialConsumptionSchema);
