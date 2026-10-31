import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRateLimitRecord extends Document {
  key: string;
  count: number;
  resetAt: Date;
  updatedAt: Date;
}

const RateLimitRecordSchema = new Schema<IRateLimitRecord>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    count: {
      type: Number,
      required: true,
      default: 1,
    },
    resetAt: {
      type: Date,
      required: true,
      index: true,
      expires: 0, // MongoDB TTL index: automatically deletes document once resetAt has passed
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const RateLimitRecord: Model<IRateLimitRecord> =
  (mongoose.models.RateLimitRecord as Model<IRateLimitRecord>) ||
  mongoose.model<IRateLimitRecord>('RateLimitRecord', RateLimitRecordSchema);
