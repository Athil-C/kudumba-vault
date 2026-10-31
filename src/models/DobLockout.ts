import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDobLockout extends Document {
  accountKey: string;
  attempts: number;
  lockedUntil: Date;
  updatedAt: Date;
}

const DobLockoutSchema = new Schema<IDobLockout>({
  accountKey: {
    type: String,
    required: true,
    unique: true,
  },
  attempts: {
    type: Number,
    required: true,
    default: 1,
  },
  lockedUntil: {
    type: Date,
    required: true,
    expires: 900, // MongoDB TTL index: auto-deletes lockout document after 15 minutes (900 seconds)
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export const DobLockout: Model<IDobLockout> =
  (mongoose.models.DobLockout as Model<IDobLockout>) ||
  mongoose.model<IDobLockout>('DobLockout', DobLockoutSchema);
